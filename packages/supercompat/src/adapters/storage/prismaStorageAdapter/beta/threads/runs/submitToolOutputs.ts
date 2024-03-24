import type { PrismaClient } from '@prisma/client'
import type OpenAI from 'openai'
import dayjs from 'dayjs'
import { RunAdapter } from '@/types'
import { serializeRun } from './serializeRun'
import { onEvent } from './onEvent'
import { getMessages } from './getMessages'

export const submitToolOutputs = ({
  prisma,
  runAdapter,
}: {
  prisma: PrismaClient
  runAdapter: RunAdapter
}) => async (...args: Parameters<OpenAI.Beta.Threads.Runs['submitToolOutputs']>): Promise<ReturnType<OpenAI.Beta.Threads.Runs['submitToolOutputs']>> => {
  const [threadId, runId, body] = args
  const {
    tool_outputs,
  } = body

  const run = await prisma.$transaction(async (prisma: PrismaClient) => {
    const runSteps = await prisma.runStep.findMany({
      where: {
        threadId,
        runId,
        type: 'TOOL_CALLS',
        status: 'IN_PROGRESS',
      },
    })

    for (const runStep of runSteps) {
      await prisma.runStep.update({
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

  const data = serializeRun({ run })

  await new Promise((resolve) => (
    new ReadableStream({
      async start(controller) {
        await runAdapter({
          run: data,
          onEvent: onEvent({ controller, prisma }),
          // @ts-ignore-next-line
          getMessages: getMessages({ prisma, run }),
        })

        controller.close()
        resolve(void 0)
      },
    })
  ))

  return data
}
