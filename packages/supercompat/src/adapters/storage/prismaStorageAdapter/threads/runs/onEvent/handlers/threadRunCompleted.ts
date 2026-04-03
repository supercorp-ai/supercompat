import type OpenAI from 'openai'
import { RunStatus } from '@/types/prisma'
import type { Prisma, PrismaClient } from '@prisma/client'

export const threadRunCompleted = ({
  prisma,
  event,
  controller,
}: {
  prisma: PrismaClient
  event: OpenAI.Beta.AssistantStreamEvent.ThreadRunCompleted
  controller: ReadableStreamDefaultController<OpenAI.Beta.AssistantStreamEvent.ThreadRunCompleted>
}) => {
  controller.enqueue(event)

  return prisma.run.update({
    where: {
      id: event.data.id,
    },
    data: {
      status: RunStatus.COMPLETED,
      requiredAction: undefined,
      completedAt: event.data.completed_at ?? Math.floor(Date.now() / 1000),
      ...(event.data.usage != null
        ? { usage: event.data.usage as unknown as Prisma.InputJsonValue }
        : {}),
    },
  })
}
