import dayjs from 'dayjs'
import type OpenAI from 'openai'

export interface PrismaRunStep {
  id: string
  threadId: string
  assistantId: string
  runId: string
  type: string
  status: string
  stepDetails: unknown
  lastError: unknown
  expiredAt: number | null
  cancelledAt: number | null
  failedAt: number | null
  completedAt: number | null
  metadata: unknown
  usage: unknown
  createdAt: Date
}

export const serializeRunStep = ({
  runStep,
}: {
  runStep: PrismaRunStep
}) => ({
  id: runStep.id,
  object: 'thread.run.step' as 'thread.run.step',
  created_at: dayjs(runStep.createdAt).unix(),
  assistant_id: runStep.assistantId,
  thread_id: runStep.threadId,
  run_id: runStep.runId,
  type: runStep.type.toLowerCase() as OpenAI.Beta.Threads.Runs.RunStep['type'],
  status: runStep.status.toLowerCase() as OpenAI.Beta.Threads.Runs.RunStep['status'],
  step_details: runStep.stepDetails as OpenAI.Beta.Threads.Runs.RunStep['step_details'],
  last_error: runStep.lastError as OpenAI.Beta.Threads.Runs.RunStep['last_error'],
  expired_at: runStep.expiredAt ? dayjs(runStep.expiredAt).unix() : null,
  cancelled_at: runStep.cancelledAt ? dayjs(runStep.cancelledAt).unix() : null,
  failed_at: runStep.failedAt ? dayjs(runStep.failedAt).unix() : null,
  completed_at: runStep.completedAt ? dayjs(runStep.completedAt).unix() : null,
  metadata: runStep.metadata as Record<string, unknown> | null,
  usage: runStep.usage as OpenAI.Beta.Threads.Runs.RunStep['usage'],
})
