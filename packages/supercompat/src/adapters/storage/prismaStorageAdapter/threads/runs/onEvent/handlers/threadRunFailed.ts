import type OpenAI from 'openai'
import { RunStatus } from '@/types/prisma'
import type { Prisma, PrismaClient } from '@prisma/client'

export const threadRunFailed = ({
  prisma,
  event,
  controller,
}: {
  prisma: PrismaClient
  event: OpenAI.Beta.AssistantStreamEvent.ThreadRunFailed
  controller: ReadableStreamDefaultController<OpenAI.Beta.AssistantStreamEvent.ThreadRunFailed>
}) => {
  controller.enqueue(event)

  return prisma.run.update({
    where: {
      id: event.data.id,
    },
    data: {
      status: RunStatus.FAILED,
      failedAt: event.data.failed_at,
      lastError: (event.data.last_error as unknown) as Prisma.NullableJsonNullValueInput,
    },
  })
}
