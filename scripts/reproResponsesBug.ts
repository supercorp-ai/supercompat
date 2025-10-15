import 'dotenv/config'
import OpenAI from 'openai'
import type OpenAIType from 'openai'
import dayjs from 'dayjs'
import { HttpsProxyAgent } from 'https-proxy-agent'
import {
  supercompat,
  openaiClientAdapter,
  responsesRunAdapter,
  responsesStorageAdapter,
} from '../packages/supercompat/src'

const STREAM_TIMEOUT_MS = Number.parseInt(
  process.env.STREAM_TIMEOUT_MS ?? '90000',
  10,
)
const STREAM_MAX_EVENTS = Number.parseInt(
  process.env.STREAM_MAX_EVENTS ?? '200',
  10,
)

const nextWithTimeout = <T>(
  iterator: AsyncIterator<T>,
  timeoutMs: number,
) =>
  new Promise<IteratorResult<T>>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `Timed out waiting for stream event after ${timeoutMs}ms`,
        ),
      )
    }, timeoutMs)

    iterator
      .next()
      .then((result) => {
        clearTimeout(timer)
        resolve(result)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })

async function main() {
  const apiKey = process.env.TEST_OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('TEST_OPENAI_API_KEY is required')
  }

  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const tools: OpenAIType.Beta.AssistantTool[] = [
    {
      type: 'function',
      function: {
        name: 'get_city_weather',
        description:
          'Return the current weather for a single city. Always call it once per city.',
        parameters: {
          type: 'object',
          properties: {
            city: {
              type: 'string',
              description: 'City name, e.g. San Francisco or New York City.',
            },
          },
          required: ['city'],
        },
      },
    },
  ]

  const openaiAssistant = {
    id: 'multi-tool-assistant',
    object: 'assistant' as const,
    model: 'gpt-4.1-mini',
    instructions:
      'You are a meticulous assistant. Think out loud before taking actions. When the user asks for weather in multiple cities, call the weather tool exactly once per city before answering.',
    description: null,
    name: 'Multi Tool Assistant',
    metadata: {},
    tools,
    created_at: dayjs().unix(),
  }

  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: responsesRunAdapter({
      getOpenaiAssistant: () => openaiAssistant,
    }),
    storage: responsesStorageAdapter(),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content:
      'Please look up the current weather for San Francisco and New York City. Call the tool for both cities in the same step before responding, then summarize both results together.',
  })

  let stream: AsyncIterable<OpenAIType.Beta.AssistantStreamEvent> =
    await client.beta.threads.runs.create(thread.id, {
      assistant_id: openaiAssistant.id,
      stream: true,
      instructions:
      'Call get_city_weather for every requested city before responding. You may issue multiple tool calls in the same step.',
      tools,
    })

  while (true) {
    let requiresAction:
      | OpenAIType.Beta.AssistantStreamEvent.ThreadRunRequiresAction
      | undefined
    let completedEvent:
      | OpenAIType.Beta.AssistantStreamEvent.ThreadRunCompleted
      | undefined
    const bufferedEvents: OpenAIType.Beta.AssistantStreamEvent[] = []

    const iterator = stream[Symbol.asyncIterator]()
    let eventsConsumed = 0
    try {
      while (eventsConsumed < STREAM_MAX_EVENTS) {
        const { value, done } = await nextWithTimeout(
          iterator,
          STREAM_TIMEOUT_MS,
        )

        if (done || !value) break

        const event = value as OpenAIType.Beta.AssistantStreamEvent
        bufferedEvents.push(event)
        eventsConsumed += 1

        if (event.event === 'thread.run.requires_action') {
          requiresAction =
            event as OpenAIType.Beta.AssistantStreamEvent.ThreadRunRequiresAction
          break
        }

        if (event.event === 'thread.run.completed') {
          completedEvent =
            event as OpenAIType.Beta.AssistantStreamEvent.ThreadRunCompleted
          break
        }

        if (event.event === 'thread.run.failed') {
          throw new Error(
            `Run failed: ${JSON.stringify(
              (
                event as OpenAIType.Beta.AssistantStreamEvent.ThreadRunFailed
              ).data.last_error,
              null,
              2,
            )}`,
          )
        }
      }
    } finally {
      await iterator.return?.()
    }

    if (eventsConsumed >= STREAM_MAX_EVENTS) {
      throw new Error(
        `Reached STREAM_MAX_EVENTS (${STREAM_MAX_EVENTS}) without terminal event`,
      )
    }

    if (completedEvent) {
      console.log('Run completed')
      break
    }

    if (!requiresAction) {
      console.log('Buffered events with no requires_action:')
      for (const ev of bufferedEvents) {
        console.log(ev.event)
      }
      throw new Error('Stream ended without requires_action or completion')
    }

    console.log('Events leading to requires_action:')
    for (const ev of bufferedEvents) {
      console.log(ev.event)
    }

    const toolCalls =
      requiresAction.data.required_action?.submit_tool_outputs.tool_calls ?? []

    if (toolCalls.length === 0) {
      throw new Error('requires_action without tool calls')
    }

    console.log('Received tool calls:')
    for (const call of toolCalls) {
      console.log(JSON.stringify(call, null, 2))
    }

    if (process.env.RETRIEVE_RESPONSE === '1') {
      let rawResponse: Awaited<
        ReturnType<typeof realOpenAI.responses.retrieve>
      >
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          rawResponse = await realOpenAI.responses.retrieve(
            requiresAction.data.id,
          )
          break
        } catch (error: any) {
          const status = error?.status ?? error?.cause?.status
          if (status === 404 && attempt < 4) {
            const delayMs = 100 * (attempt + 1)
            console.warn(
              `responses.retrieve 404, retrying in ${delayMs}ms (attempt ${
                attempt + 1
              })`,
            )
            await new Promise((resolve) => setTimeout(resolve, delayMs))
            continue
          }
          throw error
        }
      }

      if (!rawResponse) {
        throw new Error('Unable to retrieve response after retries')
      }

      const pendingFunctionCalls =
        rawResponse.output
          ?.filter(
            (item: any) => item.type === 'function_call',
          )
          .map((item: any) => ({
            id: item.id,
            call_id: item.call_id,
            status: item.status,
            name: item.name,
          })) ?? []

      console.log('Response API function calls for run:', pendingFunctionCalls)
    }

    const toolOutputs: OpenAIType.Beta.Threads.RunSubmitToolOutputsParams['tool_outputs'] =
      toolCalls.map((toolCall) => {
        const cityArgument = (() => {
          try {
            const parsed = JSON.parse(toolCall.function?.arguments ?? '{}')
            return parsed.city ?? 'unknown'
          } catch {
            return 'unknown'
          }
        })()

        return {
          tool_call_id: toolCall.id,
          output: JSON.stringify({
            city: cityArgument,
            temperature_f: 70,
            conditions: 'sunny',
          }),
        }
      })

    // Uncomment to intentionally drop one output for debugging missing-output errors.
    const submittedOutputs = toolOutputs
    // const submittedOutputs = toolOutputs.slice(0, 1)

    console.log('Submitting tool outputs:')
    console.log(submittedOutputs)

    const submitDelay = Number.parseInt(
      process.env.SUBMIT_DELAY_MS ?? '0',
      10,
    )
    if (Number.isFinite(submitDelay) && submitDelay > 0) {
      console.log(`Waiting ${submitDelay}ms before submitting tool outputs`)
      await new Promise((resolve) => setTimeout(resolve, submitDelay))
    }

    try {
      stream = await client.beta.threads.runs.submitToolOutputs(
        requiresAction.data.id,
        {
          thread_id: thread.id,
          stream: true,
          tool_outputs: submittedOutputs,
        },
      )
    } catch (error) {
      console.error('submit tool outputs failed', error)
      if (process.env.DEBUG_ON_FAIL === '1') {
        try {
          const diagnostic = await realOpenAI.responses.retrieve(
            requiresAction.data.id,
          )
          console.log('Diagnostic response output:', diagnostic.output)
        } catch (diagnosticError) {
          console.error('Diagnostic retrieve failed:', diagnosticError)
        }
      }
      throw error
    }
  }

  console.log('Done')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
