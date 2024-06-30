import type OpenAI from 'openai'
import { RunStatus } from '@/types/prisma'
import type { PrismaClient } from '@prisma/client'

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
    },
  })
}
