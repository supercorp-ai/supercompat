import type OpenAI from 'openai'
import { RunStepStatus } from '@/types/prisma'
import type { Prisma, PrismaClient } from '@prisma/client'

export const threadRunStepCompleted = async ({
  prisma,
  event,
  controller,
}: {
  prisma: PrismaClient
  event: OpenAI.Beta.AssistantStreamEvent.ThreadRunStepCompleted
  controller: ReadableStreamDefaultController<OpenAI.Beta.AssistantStreamEvent.ThreadRunStepCompleted>
}) => {
  controller.enqueue(event)

  await prisma.runStep.update({
    where: {
      id: event.data.id,
    },
    data: {
      status: RunStepStatus.COMPLETED as Prisma.RunStepUpdateInput['status'],
      stepDetails: event.data.step_details as unknown as Prisma.InputJsonValue,
      completedAt: event.data.completed_at,
    },
  })
}
