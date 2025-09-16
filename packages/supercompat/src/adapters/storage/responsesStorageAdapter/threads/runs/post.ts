import type OpenAI from 'openai'
import { uid } from 'radash'
import dayjs from 'dayjs'
import { assign } from 'radash'
import { runsRegexp } from '@/lib/runs/runsRegexp'
import { serializeResponseAsRun } from '@/lib/responses/serializeResponseAsRun'
import { RunAdapterPartobClient } from '@/types'

type RunCreateResponse = Response & {
  json: () => Promise<OpenAI.Beta.Threads.Run>
}

const serializeTools = ({
  tools,
}: {
  tools: OpenAI.Beta.Threads.Runs.RunCreateParams['tools']
}) => {
  if (!tools?.length) return {}

  return {
    tools: tools.map((tool) => ({
      type: tool.type,
      // @ts-ignore-next-line
      ...(tool[tool.type] || {}),
    }))
  }
}

const defaultAssistant = {
  model: '',
  instructions: '',
  additional_instructions: null,
  truncation_strategy: {
    type: 'auto',
  },
  response_format: {
    type: 'text',
  },
  // tools: [],
  // metadata: {},
}

export const post = ({
  openai,
  openaiAssistant,
  runAdapter,
}: {
  openai: OpenAI
  openaiAssistant: OpenAI.Beta.Assistants.Assistant
  runAdapter: RunAdapterPartobClient
}) => async (urlString: string, options: RequestInit & { body: string }): Promise<RunCreateResponse> => {
  const url = new URL(urlString)
  const [, threadId] = url.pathname.match(new RegExp(runsRegexp))!

  const body = JSON.parse(options.body)
  const {
    assistant_id,
    stream,
  } = body

  console.dir({ runsPort: true, body }, { depth: null })

  const {
    model,
    instructions,
    // additional_instructions,
    tools,
    metadata,
    response_format,
    truncation_strategy,
  } = assign({
    ...defaultAssistant,
    ...openaiAssistant,
  }, body)


  const response = await openai.responses.create({
    conversation: threadId,
    instructions,
    model,
    metadata,
    stream,
    ...serializeTools({ tools }),
    truncation: truncation_strategy.type,
    text: {
      format: response_format,
    },
    input: '',
  })

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        await runAdapter({
          threadId,
          response,
          onEvent: async (event) => (
            controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
          ),
        })
      } catch (error: any) {
        console.error(error)

        const event = {
          event: 'thread.run.failed',
          data: {
            id: uid(24),
            failed_at: dayjs().unix(),
            last_error: {
              code: 'server_error',
              message: `${error?.message ?? ''} ${error?.cause?.message ?? ''}`,
            },
          },
        }

        controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
      }

      controller.close()
    },
  })

  if (stream) {
    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
      },
    })
  } else {
    const data = serializeResponseAsRun({
      response,
      assistantId: assistant_id,
    })

    return new Response(JSON.stringify(
      data
    ), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
}
