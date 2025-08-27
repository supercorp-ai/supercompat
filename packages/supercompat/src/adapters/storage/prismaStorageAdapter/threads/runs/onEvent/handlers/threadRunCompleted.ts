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
  controller: ReadableStreamDefaultController<string>
}) => {
  controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)

  const runRecord = await prisma.run.update({
    where: {
      id: event.data.id,
    },
    data: {
      status: RunStatus.COMPLETED,
      requiredAction: undefined,
    },
  })

    return runRecord
  }
