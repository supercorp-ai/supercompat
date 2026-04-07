import type OpenAI from 'openai'
import type { PrismaClient } from '@prisma/client'

export const threadRunStepCompleted = async ({
  prisma,
  event,
  controller,
}: {
  prisma: PrismaClient
  event: OpenAI.Beta.AssistantStreamEvent.ThreadRunStepCompleted
  controller: ReadableStreamDefaultController
}) => {
  // Tool call completion details are handled in threadRunCompleted and threadRunRequiresAction
}
