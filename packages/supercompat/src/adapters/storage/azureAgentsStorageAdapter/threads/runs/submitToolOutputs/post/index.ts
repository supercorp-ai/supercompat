import type { AIProjectsClient } from '@azure/ai-projects'
import { submitToolOutputsRegexp } from '@/lib/runs/submitToolOutputsRegexp'
import { RunAdapterPartobClient } from '@/types'
import { serializeRun } from '../../serializeRun'
import { onEvent } from '../../onEvent'
import { getMessages } from '../../getMessages'
import { serializeRunStep } from '../../steps/serializeRunStep'
import { updateRun } from './updateRun'

export const post = ({
  azureAiProjectsClient,
  runAdapter,
}: {
  azureAiProjectsClient: AIProjectsClient
  runAdapter: RunAdapterPartobClient
}) => async (urlString: string, options: any) => {
  const url = new URL(urlString)
  const [, threadId, runId] = url.pathname.match(new RegExp(submitToolOutputsRegexp))!

  const body = JSON.parse(options.body)

  const {
    tool_outputs,
    stream,
  } = body
  console.log({ tool_outputs })

  const response = azureAiProjectsClient.agents.submitToolOutputsToRun(threadId, runId, tool_outputs, {
    stream,
  })
  //   stream,
  //   model,
  //   instructions,
  //   additionalInstructions: additional_instructions,
  //   tools,
  //   temperature,
  //   topP: top_p,
  //   maxPromptTokens: max_prompt_tokens,
  //   maxCompletionTokens: max_completion_tokens,
  //   truncationStrategy: truncation_strategy,
  //   toolChoice: tool_choice,
  //   responseFormat: response_format,
  //   metadata,
  // })

  if (stream) {
    return new Response(response.stream, {
      headers: {
        'Content-Type': 'text/event-stream',
      },
    })
  } else {
    const data = serializeRun({ run: await response })

    return new Response(JSON.stringify(
      data
    ), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  // if (stream) {
  //   const readableStream = new ReadableStream({
  //     async start(controller) {
  //       const run = await updateRun({
  //         prisma,
  //         runId,
  //         threadId,
  //         tool_outputs,
  //         onThreadRunStepCompleted: async ({ runStep }) => {
  //           controller.enqueue(`data: ${JSON.stringify({
  //             event: 'thread.run.step.completed',
  //             data: serializeRunStep({ runStep }),
  //           })}\n\n`)
  //         }
  //       })
  //
  //       await runAdapter({
  //         run: serializeRun({ run }),
  //         onEvent: onEvent({
  //           controller: {
  //             ...controller,
  //             enqueue: (data) => {
  //               controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
  //             },
  //           },
  //           prisma,
  //         }),
  //         getMessages: getMessages({ prisma, run }),
  //       })
  //
  //       controller.close()
  //     },
  //   })
  //
  //   return new Response(readableStream, {
  //     headers: {
  //       'Content-Type': 'text/event-stream',
  //     },
  //   })
  // } else {
  //   const run = await updateRun({
  //     prisma,
  //     runId,
  //     threadId,
  //     tool_outputs,
  //   })
  //
  //   await new Promise((resolve) => (
  //     new ReadableStream({
  //       async start(controller) {
  //         await runAdapter({
  //           run: serializeRun({ run }),
  //           onEvent: onEvent({
  //             controller: {
  //               ...controller,
  //               enqueue: (data) => {
  //                 controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
  //               },
  //             },
  //             prisma,
  //           }),
  //           getMessages: getMessages({ prisma, run }),
  //         })
  //
  //         controller.close()
  //         resolve(void 0)
  //       },
  //     })
  //   ))
  //
  //   return new Response(JSON.stringify(
  //     run
  //   ), {
  //     status: 200,
  //     headers: {
  //       'Content-Type': 'application/json',
  //     },
  //   })
  // }
}
