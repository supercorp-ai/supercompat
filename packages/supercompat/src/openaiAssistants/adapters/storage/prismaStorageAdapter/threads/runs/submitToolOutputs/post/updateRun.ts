import type OpenAI from 'openai'
import type { PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'
import type { Run } from '@/types/prisma'

export const updateRun = async ({
  prisma,
  runId,
  threadId,
  onThreadRunStepCompleted = () => {},
  tool_outputs,
}: {
  prisma: PrismaClient
  runId: string
  threadId: string
  onThreadRunStepCompleted?: ({ runStep }: { runStep: any }) => void
  tool_outputs: OpenAI.Beta.Threads.RunSubmitToolOutputsParams['tool_outputs']
}) => (
  // @ts-expect-error prisma transaction typing is broken
  prisma.$transaction(async (prisma: PrismaClient) => {
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
            // @ts-ignore-next-line
            tool_calls: runStep.stepDetails!.tool_calls.map((toolCall) => {
              // @ts-ignore-next-line
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

      onThreadRunStepCompleted({
        runStep: completedRunStep,
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
  }) as Promise<Run>
)
