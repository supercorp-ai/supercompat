import type OpenAI from 'openai'
import { MessageStatus, RunStepType } from '@/types/prisma'
import { $Enums, Prisma, type PrismaClient } from '@prisma/client'

export const threadMessageCompleted = async ({
  prisma,
  event,
  controller,
}: {
  prisma: PrismaClient
  event: OpenAI.Beta.AssistantStreamEvent.ThreadMessageCompleted
  controller: ReadableStreamDefaultController<OpenAI.Beta.AssistantStreamEvent.ThreadMessageCompleted>
}) => {
  controller.enqueue(event)

  const toolCalls = (event.data as { tool_calls?: unknown }).tool_calls

  if (toolCalls !== undefined) {
    const latestRunStep = await prisma.runStep.findFirst({
      where: {
        threadId: event.data.thread_id,
        type: RunStepType.TOOL_CALLS as $Enums.RunStepType,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    if (!latestRunStep) {
      throw new Error('No run step found')
    }

    await prisma.runStep.update({
      where: {
        id: latestRunStep.id,
      },
      data: {
        stepDetails: {
          type: 'tool_calls',
          tool_calls: toolCalls,
        } as Prisma.InputJsonValue,
      },
    })
  }
  return prisma.message.update({
    where: {
      id: event.data.id,
    },
    data: {
      status: MessageStatus.COMPLETED as $Enums.MessageStatus,
      ...(event.data.content
        ? { content: event.data.content as unknown as Prisma.InputJsonValue }
        : {}),
      ...(toolCalls !== undefined
        ? { toolCalls: toolCalls as Prisma.InputJsonValue }
        : {}),
    },
  })
}
