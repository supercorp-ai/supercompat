import type OpenAI from 'openai'
import { RunStatus } from '@/types/prisma'
import type { PrismaClient } from '@prisma/client'

export const threadRunFailed = async ({
  prisma,
  event,
  controller,
}: {
  prisma: PrismaClient
  event: OpenAI.Beta.AssistantStreamEvent.ThreadRunFailed
  controller: ReadableStreamDefaultController<string>
}) => {
  controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)

    const runRecord = await prisma.run.update({
      where: {
        id: event.data.id,
      },
      data: {
        status: RunStatus.FAILED,
        failedAt: event.data.failed_at,
        lastError: event.data.last_error as any,
      },
    })

    return runRecord
  }
