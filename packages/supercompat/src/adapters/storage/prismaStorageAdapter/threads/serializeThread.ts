import dayjs from 'dayjs'
import type { ThreadWithConversationId } from '@/types'

type PrismaThread = {
  id: string
  createdAt: Date
  metadata: any
  openaiConversationId?: string | null
}

export const serializeThread = ({
  thread,
}: {
  thread: PrismaThread
}): ThreadWithConversationId => ({
  id: thread.id,
  object: 'thread' as 'thread',
  created_at: dayjs(thread.createdAt).unix(),
  metadata: thread.metadata as any,
  openaiConversationId: thread.openaiConversationId ?? null,
  // TODO
  tool_resources: null,
})
