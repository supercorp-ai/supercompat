import type OpenAI from 'openai'
import { RunStatus } from '@/types/prisma'
import type { PrismaClient } from '@prisma/client'

export const threadRunCompleted = async ({
  prisma,
  event,
  controller,
}: {
  prisma: PrismaClient
  event: OpenAI.Beta.AssistantStreamEvent.ThreadRunCompleted
  controller: ReadableStreamDefaultController<OpenAI.Beta.AssistantStreamEvent.ThreadRunCompleted>
}) => {
  controller.enqueue(event)

  const runRecord = await prisma.run.update({
    where: {
      id: event.data.id,
    },
    data: {
      status: RunStatus.COMPLETED,
      requiredAction: undefined,
    },
  })

  if (event.data.metadata?.openaiConversationId) {
    await prisma.thread.update({
      where: { id: event.data.thread_id },
      data: {
        openaiConversationId: event.data.metadata.openaiConversationId,
      },
    })
  }

  return runRecord
}
