// @ts-ignore-next-line
import type { Thread } from '@prisma/client'
import dayjs from 'dayjs'

export const serializeThread = ({
  thread,
}: {
  thread: Thread
}) => {
  // Strip internal assistantId from metadata before returning
  let metadata = thread.metadata
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata) && 'assistantId' in metadata) {
    const { assistantId, ...rest } = metadata as Record<string, unknown>
    metadata = Object.keys(rest).length > 0 ? rest : null
  }

  return {
  id: thread.id,
  object: 'thread' as 'thread',
  created_at: dayjs(thread.createdAt).unix(),
  metadata,
  tool_resources: {
    code_interpreter: {
      file_ids: [],
    },
    file_search: {
      vector_store_ids: [],
    },
  },
}
}
