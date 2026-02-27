import type OpenAI from 'openai'
import type { PrismaClient } from '@prisma/client'
import { uid } from 'radash'

export const threadRunStepCreated = async ({
  prisma,
  event,
  controller,
  responseId,
  outputIndex,
}: {
  prisma: PrismaClient
  event: OpenAI.Beta.AssistantStreamEvent.ThreadRunStepCreated
  controller: ReadableStreamDefaultController
  responseId: string
  outputIndex: number
}) => {
  // For tool_calls steps, return a stub with an id so completionsRunAdapter
  // can reference it in subsequent delta events
  if (event.data.type === 'tool_calls') {
    return {
      id: uid(24),
      type: 'tool_calls',
      status: 'in_progress',
    }
  }

  // Skip message_creation steps — they're handled via threadMessageCreated
  return null
}
