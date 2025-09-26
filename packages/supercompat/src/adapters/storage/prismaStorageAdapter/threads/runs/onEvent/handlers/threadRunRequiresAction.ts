import type OpenAI from 'openai'
import { RunStatus } from '@/types/prisma'
import { $Enums, Prisma, type PrismaClient } from '@prisma/client'

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
      status: RunStatus.REQUIRES_ACTION as $Enums.RunStatus,
      requiredAction: event.data.required_action != null
        ? (event.data.required_action as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  })
}
