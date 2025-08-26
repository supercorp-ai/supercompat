import dayjs from 'dayjs'
import type OpenAI from 'openai'
import { assign } from 'radash'

export interface PrismaMessage {
  id: string
  threadId: string
  createdAt: Date
  completedAt: Date | null
  incompleteAt: Date | null
  incompleteDetails: unknown
  role: string
  content: unknown
  assistantId: string | null
  runId: string | null
  attachments: unknown
  status: string
  metadata: unknown
  toolCalls?: unknown
}

export const serializeMessage = ({
  message,
}: {
  message: PrismaMessage
}) => ({
  id: message.id,
  object: 'thread.message' as const,
  created_at: dayjs(message.createdAt).unix(),
  thread_id: message.threadId,
  completed_at: message.completedAt ? dayjs(message.completedAt).unix() : null,
  incomplete_at: message.incompleteAt ? dayjs(message.incompleteAt).unix() : null,
  incomplete_details: message.incompleteDetails as OpenAI.Beta.Threads.Messages.Message.IncompleteDetails,
  role: message.role.toLowerCase() as 'user' | 'assistant',
  content: message.content as unknown as OpenAI.Beta.Threads.Messages.TextContentBlock[],
  assistant_id: message.assistantId,
  run_id: message.runId,
  attachments:
    message.attachments as OpenAI.Beta.Threads.Messages.Message.Attachment[] | null,
  status: message.status.toLowerCase() as OpenAI.Beta.Threads.Messages.Message['status'],
  metadata: assign(
    (message.metadata as Record<string, unknown>) ?? {},
    message.toolCalls ? { toolCalls: message.toolCalls } : {},
  ) as any,
})
