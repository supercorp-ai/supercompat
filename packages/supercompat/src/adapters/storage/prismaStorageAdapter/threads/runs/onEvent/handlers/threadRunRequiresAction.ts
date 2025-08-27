import type OpenAI from 'openai'
import type { PrismaClient } from '@prisma/client'
import { RunStatus } from '@/types/prisma'

export const threadRunRequiresAction = async ({
  prisma,
  event,
  controller,
}: {
  prisma: PrismaClient
  event: OpenAI.Beta.AssistantStreamEvent.ThreadRunRequiresAction
  controller: ReadableStreamDefaultController<string>
}) => {
  controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)

    const runRecord = await prisma.run.update({
      where: {
        id: event.data.id,
      },
      data: {
        status: RunStatus.REQUIRES_ACTION,
        requiredAction: event.data.required_action as any,
      },
    })

    return runRecord
  }
