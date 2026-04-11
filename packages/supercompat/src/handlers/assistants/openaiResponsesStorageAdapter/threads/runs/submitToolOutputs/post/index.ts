import type { OpenAI } from 'openai'
import type { RunAdapterWithAssistant, ResponsesRunBody } from '@/types'
import { submitToolOutputsRegexp } from '@/lib/runs/submitToolOutputsRegexp'
import { serializeItemAsFunctionCallRunStep } from '@/lib/items/serializeItemAsFunctionCallRunStep'
import { serializeItemAsComputerCallRunStep } from '@/lib/items/serializeItemAsComputerCallRunStep'
import { isOpenaiComputerUseModel } from '@/lib/openaiComputerUse'
import { enqueueSSE } from '@/lib/sse/enqueueSSE'
import { createResponseToAssistantEventTranslator } from '@/lib/responses/createResponseToAssistantEventTranslator'
import { getToolCallOutputItems, serializeTools, truncation } from '../shared'

export const post = ({
  client,
  runAdapter,
}: {
  client: OpenAI
  runAdapter: RunAdapterWithAssistant
}) => async (urlString: string, options: any) => {
  const url = new URL(urlString)
  const [, threadId, runId] = url.pathname.match(new RegExp(submitToolOutputsRegexp))!

  const body = JSON.parse(options.body)

  const {
    tool_outputs,
    stream,
  } = body

  const toolCallOutputItems = getToolCallOutputItems({ tool_outputs })
  const input = [...toolCallOutputItems.functionCallOutputItems, ...toolCallOutputItems.computerCallOutputItems]

  const previousResponse = await client.responses.retrieve(runId)

  const openaiAssistant = await runAdapter.getOpenaiAssistant()

  const shouldSendInstructions = typeof openaiAssistant.instructions === 'string' &&
    openaiAssistant.instructions.trim().length > 0

  const responseBody: OpenAI.Responses.ResponseCreateParams = {
    conversation: threadId,
    stream,
    input,
  }

  responseBody.model = openaiAssistant.model
  Object.assign(responseBody, serializeTools({
    tools: openaiAssistant.tools,
    useOpenaiComputerTool: isOpenaiComputerUseModel({
      model: openaiAssistant.model,
    }),
  }))
  responseBody.truncation = truncation({ openaiAssistant })

  if (shouldSendInstructions && typeof openaiAssistant.instructions === 'string') {
    responseBody.instructions = openaiAssistant.instructions
  }

  let completedRunData: OpenAI.Beta.Threads.Run | null = null

  // Streaming: return SSE events
  const readableStream = new ReadableStream({
    async start(controller) {
      toolCallOutputItems.functionCallOutputItems.forEach((item) => {
        const toolCallItem = previousResponse.output.find((i) => (
          i.type === 'function_call' &&
            i.call_id === item.call_id
        )) as OpenAI.Responses.ResponseFunctionToolCall | undefined

        if (!toolCallItem) {
          return
        }

        enqueueSSE(controller, 'thread.run.step.completed', serializeItemAsFunctionCallRunStep({
            item: toolCallItem,
            items: toolCallOutputItems.functionCallOutputItems,
            threadId,
            openaiAssistant,
            runId,
          }))
      })

      toolCallOutputItems.computerCallOutputItems.forEach((item) => {
        const toolCallItem = previousResponse.output.find((i) => (
          i.type === 'computer_call' &&
            i.call_id === item.call_id
        )) as OpenAI.Responses.ResponseComputerToolCall | undefined

        if (!toolCallItem) {
          return
        }

        enqueueSSE(controller, 'thread.run.step.completed', serializeItemAsComputerCallRunStep({
          item: toolCallItem,
          items: toolCallOutputItems.computerCallOutputItems,
          threadId,
          openaiAssistant,
          runId,
        }))
      })

      const translator = createResponseToAssistantEventTranslator({
        getOpenaiAssistant: runAdapter.getOpenaiAssistant,
        threadId,
        client,
        fallbackRunId: runId,
        onEvent: async (event: OpenAI.Beta.AssistantStreamEvent) => {
          if (event.event === 'thread.run.completed' || event.event === 'thread.run.requires_action' || event.event === 'thread.run.failed') {
            completedRunData = event.data as OpenAI.Beta.Threads.Run
          }
          enqueueSSE(controller, event.event, event.data)
        },
      })

      try {
        await runAdapter.handleRun({
          body: responseBody as ResponsesRunBody,
          onEvent: async (event: any) => {
            await translator.handleEvent(event)
          },
        })
        await translator.finalize()
      } catch (error: any) {
        console.error(error)
        await translator.handleError(error)
      } finally {
        translator.cleanup()
      }

      controller.close()
    },
  })

  if (!stream) {
    // Non-streaming: consume the stream and return a Run-shaped response
    await new Promise<void>((resolve, reject) => {
      const reader = readableStream.getReader()
      const pump = (): Promise<void> => reader.read().then(({ done }) => done ? resolve() : pump()).catch(reject)
      pump()
    })

    if (!completedRunData) {
      return new Response(JSON.stringify({ error: { message: 'Run failed to produce a result', type: 'server_error' } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(completedRunData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
    },
  })
}
