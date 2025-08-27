import type OpenAI from 'openai'
import { MessageStatus, RunStepType } from '@/types/prisma'
import type { PrismaClient } from '@prisma/client'

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

  if (event.data.tool_calls) {
    const latestRunStep = await prisma.runStep.findFirst({
      where: {
        threadId: event.data.thread_id,
        type: RunStepType.TOOL_CALLS,
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
          tool_calls: event.data.tool_calls,
        },
      },
    })
  }

  return prisma.message.update({
    where: {
      id: event.data.id,
    },
    data: {
      status: MessageStatus.COMPLETED,
      ...(event.data.content ? { content: event.data.content } : {}),
      ...(event.data.tool_calls ? { toolCalls: event.data.tool_calls } : {}),
    },
  })
}
