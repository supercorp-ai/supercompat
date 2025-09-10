import type OpenAI from 'openai'
import { uid } from 'radash'
import dayjs from 'dayjs'
import { assign } from 'radash'
import { runsRegexp } from '@/lib/runs/runsRegexp'
import { serializeRun } from './serializeRun'
import { RunAdapterPartobClient } from '@/types'
import { onEvent } from './onEvent'

type RunCreateResponse = Response & {
  json: () => Promise<OpenAI.Beta.Threads.Run>
}

export const post = ({
  openai,
  runAdapter,
}: {
  openai: OpenAI
  runAdapter: RunAdapterPartobClient
}) => async (urlString: string, options: RequestInit & { body: string }): Promise<RunCreateResponse> => {
  const url = new URL(urlString)
  const [, threadId] = url.pathname.match(new RegExp(runsRegexp))!

  const body = JSON.parse(options.body)
  const {
    assistant_id,
    stream,
  } = body

  const {
    model,
    instructions,
    // additional_instructions,
    tools,
    metadata,
    response_format,
    truncation_strategy,
  } = assign({
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
  }, body)


  const response = await openai.responses.create({
    conversation: threadId,
    instructions,
    model,
    metadata,
    stream,
    tools,
    truncation: truncation_strategy.type,
    text: response_format,
  })

  const data = serializeRun({ response })

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        await runAdapter({
          run: data,
          onEvent: onEvent({
            controller: {
              ...controller,
              enqueue: (data) => {
                controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
              },
            },
          }),
        })
      } catch (error: any) {
        console.error(error)

        onEvent({
          controller: {
            ...controller,
            enqueue: (data) => {
              controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
            },
          },
        })({
          event: 'thread.run.failed',
          data: {
            id: uid(24),
            failed_at: dayjs().unix(),
            last_error: {
              code: 'server_error',
              message: `${error?.message ?? ''} ${error?.cause?.message ?? ''}`,
            },
          },
        } as OpenAI.Beta.AssistantStreamEvent.ThreadRunFailed)
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
