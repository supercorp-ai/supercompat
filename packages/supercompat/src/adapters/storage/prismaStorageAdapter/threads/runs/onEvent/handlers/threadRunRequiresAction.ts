import type OpenAI from 'openai'
import { RunStatus } from '@/types/prisma'
import type { Prisma, PrismaClient } from '@prisma/client'

export const threadRunRequiresAction = ({
  prisma,
  event,
  controller,
}: {
  prisma: PrismaClient
  event: OpenAI.Beta.AssistantStreamEvent.ThreadRunRequiresAction
  controller: ReadableStreamDefaultController<OpenAI.Beta.AssistantStreamEvent.ThreadRunRequiresAction>
}) => {
  controller.enqueue(event)

  return prisma.run.update({
    where: {
      id: event.data.id,
    },
    data: {
      status: RunStatus.REQUIRES_ACTION as Prisma.RunUpdateInput['status'],
      ...(event.data.required_action != null
        ? { requiredAction: event.data.required_action as unknown as Prisma.InputJsonValue }
        : {}),
    },
  })
}
