import type OpenAI from 'openai'
import type { PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'
import { assign } from 'radash'
import { runsRegexp } from '@/lib/runs/runsRegexp'
import { serializeRun } from './serializeRun'
import { RunAdapterPartobClient } from '@/types'
import { onEvent } from './onEvent'
import { getMessages, RunForMessages } from './getMessages'
import { getThread } from './getThread'

type RunCreateResponse = Response & {
  json: () => Promise<ReturnType<OpenAI.Beta.Threads.Runs['create']>>
}

export const post = ({
  prisma,
  runAdapter,
}: {
  prisma: PrismaClient
  runAdapter: RunAdapterPartobClient
}) => async (urlString: string, options: any): Promise<RunCreateResponse> => {
  const url = new URL(urlString)
  const [, threadId] = url.pathname.match(new RegExp(runsRegexp))!

  const body = JSON.parse(options.body)
  const { assistant_id, stream } = body

  const assistant = await prisma.assistant.findUnique({ where: { id: assistant_id } })

  const {
    model,
    instructions,
    // additional_instructions,
    tools,
    metadata,
    response_format,
    truncation_strategy,
  } = assign(
    {
      model: assistant?.model || 'gpt-4o-mini',
      instructions: assistant?.instructions || '',
      additional_instructions: null,
      truncation_strategy: {
        type: 'auto',
      },
      response_format: {
        type: 'text',
      },
      // tools: [],
      // metadata: {},
    },
    body,
  )

  const run = await prisma.run.create({
    data: {
      status: 'QUEUED',
      expiresAt: dayjs().add(1, 'hour').unix(),
      model,
      instructions,
      tools,
      metadata,
      thread: {
        connect: {
          id: threadId,
        },
      },
      assistant: {
        connect: {
          id: assistant_id,
        },
      },
      truncationStrategy: truncation_strategy,
      responseFormat: response_format,
    },
  })

  const data = serializeRun({ run })

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
            prisma,
          }),
          getMessages: getMessages({
            prisma,
            run: run as unknown as RunForMessages,
          }),
          getThread: getThread({ prisma, threadId }),
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
          prisma,
        })({
          event: 'thread.run.failed',
          data: {
            id: run.id,
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
