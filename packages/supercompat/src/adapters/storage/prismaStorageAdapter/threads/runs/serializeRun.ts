import type OpenAI from 'openai'
// @ts-ignore-next-line
import type { Run } from '@prisma/client'
import dayjs from 'dayjs'

export const serializeRun = ({
  run,
}: {
  run: Run
}): OpenAI.Beta.Threads.Run => ({
  id: run.id,
  object: 'thread.run' as 'thread.run',
  created_at: dayjs(run.createdAt).unix(),
  thread_id: run.threadId,
  assistant_id: run.assistantId,
  status: run.status.toLowerCase() as OpenAI.Beta.Threads.Run['status'],
  required_action: run.requiredAction as OpenAI.Beta.Threads.Run['required_action'],
  last_error: run.lastError as OpenAI.Beta.Threads.Run['last_error'],
  expires_at: dayjs(run.expiresAt).unix(),
  started_at: run.startedAt ? dayjs(run.startedAt).unix() : null,
  cancelled_at: run.cancelledAt ? dayjs(run.cancelledAt).unix() : null,
  failed_at: run.failedAt ? dayjs(run.failedAt).unix() : null,
  completed_at: run.completedAt ? dayjs(run.completedAt).unix() : null,
  model: run.model,
  instructions: run.instructions,
  tools: (run.tools as unknown) as any,
  metadata: (run.metadata as unknown) as any,
  usage: (run.usage as unknown) as any,
  truncation_strategy: {
    type: 'auto',
  },
  response_format: {
    type: 'text',
  },
  // TODO
  incomplete_details: null,
  max_completion_tokens: null,
  max_prompt_tokens: null,
  tool_choice: 'auto',
  parallel_tool_calls: true,
})
