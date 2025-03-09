import type { ThreadMessageOutput } from '@azure/ai-projects'
import dayjs from 'dayjs'
import type OpenAI from 'openai'

export const serializeMessage = ({
  message,
}: {
  message: ThreadMessageOutput
}) => ({
  id: message.id,
  object: 'thread.message' as 'thread.message',
  created_at: dayjs(message.createdAt).unix(),
  thread_id: message.threadId,
  completed_at: message.completedAt ? dayjs(message.completedAt).unix() : null,
  incomplete_at: message.incompleteAt ? dayjs(message.incompleteAt).unix() : null,
  incomplete_details: message.incompleteDetails as unknown as OpenAI.Beta.Threads.Messages.Message.IncompleteDetails,
  role: message.role.toLowerCase() as 'user' | 'assistant',
  content: message.content as unknown as OpenAI.Beta.Threads.Messages.TextContentBlock[],
  assistant_id: message.assistantId,
  run_id: message.runId,
  attachments: message.attachments,
  status: (message.status ?? 'completed') as OpenAI.Beta.Threads.Messages.Message['status'],
  metadata: message.metadata,
})
