// @ts-ignore-next-line
import type { Thread } from '@prisma/client'
import dayjs from 'dayjs'
import type { ThreadWithConversationId } from '@/types'

export const serializeThread = ({
  thread,
}: {
  thread: Thread
}): ThreadWithConversationId => ({
  id: thread.id,
  object: 'thread' as 'thread',
  created_at: dayjs(thread.createdAt).unix(),
  metadata: thread.metadata,
  openaiConversationId: (thread as any)?.openaiConversationId ?? null,
  // TODO
  tool_resources: null,
})
