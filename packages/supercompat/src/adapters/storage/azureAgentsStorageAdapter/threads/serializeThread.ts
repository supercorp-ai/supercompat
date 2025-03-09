import type { AgentThreadOutput } from '@azure/ai-projects'
import dayjs from 'dayjs'

export const serializeThread = ({
  thread,
}: {
  thread: AgentThreadOutput
}) => ({
  id: thread.id,
  object: 'thread' as 'thread',
  created_at: thread.createdAt,
  metadata: thread.metadata,
  tool_resources: thread.toolResources,
})
