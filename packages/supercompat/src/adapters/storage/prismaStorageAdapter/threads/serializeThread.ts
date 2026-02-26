// @ts-ignore-next-line
import type { Thread } from '@prisma/client'
import dayjs from 'dayjs'

export const serializeThread = ({
  thread,
}: {
  thread: Thread
}) => ({
  id: thread.id,
  object: 'thread' as 'thread',
  created_at: dayjs(thread.createdAt).unix(),
  metadata: thread.metadata,
  tool_resources: {
    code_interpreter: {
      file_ids: [],
    },
    file_search: {
      vector_store_ids: [],
    },
  },
})
