import type OpenAI from 'openai'
import { RunStatus } from '@/types/prisma'
import type { PrismaClient } from '@prisma/client'

export const threadRunInProgress = ({
  prisma,
  event,
  controller,
}: {
  prisma: PrismaClient
  event: OpenAI.Beta.AssistantStreamEvent.ThreadRunInProgress
  controller: ReadableStreamDefaultController<OpenAI.Beta.AssistantStreamEvent.ThreadRunInProgress>
}) => {
  controller.enqueue(event)

  return prisma.run.update({
    where: {
      id: event.data.id,
    },
    data: {
      status: RunStatus.IN_PROGRESS,
    },
  })
}
