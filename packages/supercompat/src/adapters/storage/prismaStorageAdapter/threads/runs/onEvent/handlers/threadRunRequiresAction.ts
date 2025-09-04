import type OpenAI from 'openai'
import type { Prisma, PrismaClient } from '@prisma/client'
import { RunStatus } from '@/types/prisma'

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
      status: RunStatus.REQUIRES_ACTION,
      requiredAction: (event.data.required_action as unknown) as Prisma.NullableJsonNullValueInput,
    },
  })
}
