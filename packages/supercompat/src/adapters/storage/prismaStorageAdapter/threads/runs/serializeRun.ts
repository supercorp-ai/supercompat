import type OpenAI from 'openai'
import dayjs from 'dayjs'

export interface PrismaRun {
  id: string
  threadId: string
  assistantId: string
  createdAt: Date
  status: string
  requiredAction: unknown
  lastError: unknown
  expiresAt: number
  startedAt: number | null
  cancelledAt: number | null
  failedAt: number | null
  completedAt: number | null
  model: string
  instructions: string
  tools: unknown[]
  metadata: unknown
  usage: unknown
}

export const serializeRun = ({
  run,
}: {
  run: PrismaRun
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
  tools: run.tools as OpenAI.Beta.AssistantTool[],
  metadata: run.metadata as Record<string, unknown> | null,
  usage: run.usage as OpenAI.Beta.Threads.Run['usage'],
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
  parallel_tool_calls: true,
} as OpenAI.Beta.Threads.Run)
