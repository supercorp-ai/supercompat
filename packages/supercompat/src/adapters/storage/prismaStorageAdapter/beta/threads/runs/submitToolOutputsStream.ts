import type { PrismaClient } from '@prisma/client'
import type OpenAI from 'openai'
import dayjs from 'dayjs'
import { RunAdapter } from '@/types'
import { serializeRun } from './serializeRun'
import { onEvent } from './onEvent'
import { getMessages } from './getMessages'
import { serializeRunStep } from './steps/serializeRunStep'

export const submitToolOutputsStream = ({
  prisma,
  runAdapter,
}: {
  prisma: PrismaClient
  runAdapter: RunAdapter
}) => (...args: Parameters<OpenAI.Beta.Threads.Runs['submitToolOutputsStream']>): ReturnType<OpenAI.Beta.Threads.Runs['submitToolOutputsStream']> => {
  return new ReadableStream({
    async start(controller) {
      const [threadId, runId, body] = args
      const {
        tool_outputs,
      } = body

      const run = await prisma.$transaction(async (prisma) => {
        const runSteps = await prisma.runStep.findMany({
          where: {
            threadId,
            runId,
            type: 'TOOL_CALLS',
            status: 'IN_PROGRESS',
          },
          orderBy: {
            createdAt: 'asc',
          },
        })

        for (const runStep of runSteps) {
          const completedRunStep = await prisma.runStep.update({
            where: {
              id: runStep.id,
            },
            data: {
              status: 'COMPLETED',
              completedAt: dayjs().unix(),
              stepDetails: {
                type: 'tool_calls',
                tool_calls: runStep.stepDetails!.tool_calls.map((toolCall) => {
                  const toolOutput = tool_outputs.find((output) => output.tool_call_id === toolCall.id) || tool_outputs[0]

                  if (!toolOutput) {
                    console.dir({ toolOutput, runStep, tool_outputs, runSteps }, { depth: null })
                    throw new Error('Tool output not found')
                  }

                  return {
                    id: toolCall.id,
                    type: toolCall.type,
                    function: {
                      ...toolCall.function,
                      output: toolOutput.output,
                    },
                  }
                }),
              },
            },
          })

          controller.enqueue({
            event: 'thread.run.step.completed',
            data: serializeRunStep({ runStep: completedRunStep }),
          })
        }

        return prisma.run.update({
          where: {
            id: runId,
          },
          data: {
            status: 'QUEUED',
          },
        })
      })

      // partobs client from above
      // @ts-ignore-next-line
      await runAdapter({
        run: serializeRun({ run }),
        onEvent: onEvent({ controller, prisma }),
        // @ts-ignore-next-line
        getMessages: getMessages({ prisma, run }),
      })

      console.log('Stream ended inside cloud storage')
      controller.close()
    },
  })
}
