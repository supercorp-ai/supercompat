// @ts-ignore-next-line
import type { Message } from '@prisma/client'
import dayjs from 'dayjs'
import type OpenAI from 'openai'
import { assign } from 'radash'

export const serializeMessage = ({
  message,
}: {
  message: Message
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
  attachments: message.attachments as OpenAI.Beta.Threads.Messages.Message['attachments'],
  status: message.status.toLowerCase() as OpenAI.Beta.Threads.Messages.Message['status'],
  metadata: assign(message.metadata as Record<any, any> ?? {}, message.toolCalls ? { toolCalls: message.toolCalls } : {}),
})
