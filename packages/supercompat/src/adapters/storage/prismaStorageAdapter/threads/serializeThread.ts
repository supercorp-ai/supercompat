import dayjs from 'dayjs'
import type { ThreadWithConversationId } from '@/types'

type PrismaThread = {
  id: string
  createdAt: Date
  metadata: Record<string, string> | null
  openaiConversationId: string | null
}

export const serializeThread = ({
  thread,
}: {
  thread: PrismaThread
}): ThreadWithConversationId => ({
  id: thread.id,
  object: 'thread' as 'thread',
  created_at: dayjs(thread.createdAt).unix(),
  metadata: thread.metadata,
  openaiConversationId: thread.openaiConversationId,
  // TODO
  tool_resources: null,
})
