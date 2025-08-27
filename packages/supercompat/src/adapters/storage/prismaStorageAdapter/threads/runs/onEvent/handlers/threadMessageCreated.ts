import type OpenAI from 'openai'
import { MessageStatus } from '@/types/prisma'
import type { PrismaClient } from '@prisma/client'
import { serializeMessage } from '../../../messages/serializeMessage'

const status = (event: OpenAI.Beta.AssistantStreamEvent.ThreadMessageCreated) => {
  if (event.data.status === 'completed') return MessageStatus.COMPLETED
  if (event.data.status === 'in_progress') return MessageStatus.IN_PROGRESS
  if (event.data.status === 'incomplete') return MessageStatus.INCOMPLETE

  throw new Error(`Unknown status: ${event.data.status}`)
}

export const threadMessageCreated = async ({
  prisma,
  event,
  controller,
}: {
  prisma: PrismaClient
  event: OpenAI.Beta.AssistantStreamEvent.ThreadMessageCreated
  controller: ReadableStreamDefaultController<string>
}) => {
  const message = await prisma.message.create({
    data: {
      threadId: event.data.thread_id,
        content: event.data.content as any,
      role: event.data.role === 'assistant' ? 'ASSISTANT' : 'USER',
      assistantId: event.data.assistant_id,
      runId: event.data.run_id,
      status: status(event),
    },
  })

  const serializedMessage = serializeMessage({ message })

  controller.enqueue(`data: ${JSON.stringify({
    ...event,
    data: serializedMessage,
  })}\n\n`)

  return serializedMessage
}
