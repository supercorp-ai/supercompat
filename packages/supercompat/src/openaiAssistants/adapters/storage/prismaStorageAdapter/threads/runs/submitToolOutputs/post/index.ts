import type { PrismaClient } from '@prisma/client'
import { submitToolOutputsRegexp } from '@/openaiAssistants/lib/runs/submitToolOutputsRegexp'
import { RunAdapterPartobClient } from '@/types'
import { serializeRun } from '../../serializeRun'
import { onEvent } from '../../onEvent'
import { enqueueSSE } from '@/openaiAssistants/lib/sse/enqueueSSE'
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
  const [, threadId, runId] = url.pathname.match(new RegExp(submitToolOutputsRegexp))!

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
            enqueueSSE(controller, 'thread.run.step.completed', serializeRunStep({ runStep }))
          }
        })

        await runAdapter.handleRun({
          run: serializeRun({ run }),
          onEvent: onEvent({
            controller: {
              ...controller,
              enqueue: (data: any) => {
                enqueueSSE(controller, data.event, data.data)
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
          await runAdapter.handleRun({
            run: serializeRun({ run }),
            onEvent: onEvent({
              controller: {
                ...controller,
                enqueue: (data: any) => {
                  enqueueSSE(controller, data.event, data.data)
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
