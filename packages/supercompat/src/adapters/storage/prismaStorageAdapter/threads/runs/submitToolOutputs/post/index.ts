import type { PrismaClient } from '@prisma/client'
import { serializeRun } from '../../serializeRun'
import { RunAdapterPartobClient } from '@/types'
import { onEvent } from '../../onEvent'
import { getMessages } from '../../getMessages'
import { serializeRunStep } from '../../steps/serializeRunStep'
import { updateRun } from './updateRun'

export const post = ({
  prisma,
  runAdapter,
}: {
  prisma: PrismaClient
  runAdapter: RunAdapterPartobClient
}) => async (urlString: string, options: any) => {
  const url = new URL(urlString)
  const [, threadId, runId] = url.pathname.match(new RegExp('^/v1/threads/([^/]+)/runs/([^/]+)/submit_tool_outputs$'))!

  const body = JSON.parse(options.body)

  const {
    tool_outputs,
    stream,
  } = body

  if (stream) {
    const readableStream = new ReadableStream({
      async start(controller) {
        const run = await updateRun({
          prisma,
          runId,
          threadId,
          tool_outputs,
          onThreadRunStepCompleted: async ({ runStep }) => {
            controller.enqueue(`data: ${JSON.stringify({
              event: 'thread.run.step.completed',
              data: serializeRunStep({ runStep }),
            })}\n\n`)
          }
        })

        await runAdapter({
          run: serializeRun({ run }),
          onEvent: onEvent({
            controller: {
              ...controller,
              enqueue: (data) => {
                controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
              },
            },
            prisma,
          }),
          getMessages: getMessages({ prisma, run }),
        })

        controller.close()
      },
    })

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
      },
    })
  } else {
    const run = await updateRun({
      prisma,
      runId,
      threadId,
      tool_outputs,
    })

    await new Promise((resolve) => (
      new ReadableStream({
        async start(controller) {
          await runAdapter({
            run: serializeRun({ run }),
            onEvent: onEvent({
              controller: {
                ...controller,
                enqueue: (data) => {
                  controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
                },
              },
              prisma,
            }),
            getMessages: getMessages({ prisma, run }),
          })

          controller.close()
          resolve(void 0)
        },
      })
    ))

    return new Response(JSON.stringify(
      run
    ), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
}
