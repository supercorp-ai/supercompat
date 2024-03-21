import dayjs from 'dayjs'
import type { RunStep } from '@prisma/client'
import type OpenAI from 'openai'

export const serializeRunStep = ({
  runStep,
}: {
  runStep: RunStep
}) => ({
  id: runStep.id,
  object: 'thread.run.step' as 'thread.run.step',
  created_at: dayjs(runStep.createdAt).unix(),
  assistant_id: runStep.assistantId,
  thread_id: runStep.threadId,
  run_id: runStep.runId,
  type: runStep.type.toLowerCase() as OpenAI.Beta.Threads.Runs.RunStep['type'],
  status: runStep.status.toLowerCase() as OpenAI.Beta.Threads.Runs.RunStep['status'],
  // @ts-ignore-next-line
  step_details: runStep.stepDetails as OpenAI.Beta.Threads.Runs.RunStep['step_details'],
  last_error: runStep.lastError as OpenAI.Beta.Threads.Runs.RunStep['last_error'],
  expired_at: runStep.expiredAt ? dayjs(runStep.expiredAt).unix() : null,
  cancelled_at: runStep.cancelledAt ? dayjs(runStep.cancelledAt).unix() : null,
  failed_at: runStep.failedAt ? dayjs(runStep.failedAt).unix() : null,
  completed_at: runStep.completedAt ? dayjs(runStep.completedAt).unix() : null,
  metadata: runStep.metadata,
  usage: runStep.usage as OpenAI.Beta.Threads.Runs.RunStep['usage'],
})
