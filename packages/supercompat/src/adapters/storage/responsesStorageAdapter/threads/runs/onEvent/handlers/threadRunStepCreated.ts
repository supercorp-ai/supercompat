import type OpenAI from 'openai'
import { RunStepType, RunStepStatus } from '@/types/prisma'
import type { PrismaClient } from '@prisma/client'
import { serializeRunStep } from '../../steps/serializeRunStep'

const type = (event: OpenAI.Beta.AssistantStreamEvent.ThreadRunStepCreated) => {
  if (event.data.type === 'message_creation') return RunStepType.MESSAGE_CREATION
  if (event.data.type === 'tool_calls') return RunStepType.TOOL_CALLS

  throw new Error(`Unknown type: ${event.data.type}`)
}

const status = (event: OpenAI.Beta.AssistantStreamEvent.ThreadRunStepCreated) => {
  if (event.data.status === 'in_progress') return RunStepStatus.IN_PROGRESS
  if (event.data.status === 'cancelled') return RunStepStatus.CANCELLED
  if (event.data.status === 'completed') return RunStepStatus.COMPLETED
  if (event.data.status === 'failed') return RunStepStatus.FAILED
  if (event.data.status === 'expired') return RunStepStatus.EXPIRED

  throw new Error(`Unknown status: ${event.data.status}`)
}

export const threadRunStepCreated = async ({
  prisma,
  event,
  controller,
}: {
  prisma: PrismaClient
  event: OpenAI.Beta.AssistantStreamEvent.ThreadRunStepCreated
  controller: ReadableStreamDefaultController<OpenAI.Beta.AssistantStreamEvent.ThreadRunStepCreated>
}) => {
  const runStep = await prisma.runStep.create({
    data: {
      runId: event.data.run_id,
      assistantId: event.data.assistant_id,
      threadId: event.data.thread_id,
      type: type(event),
      status: status(event),
      stepDetails: event.data.step_details,
      completedAt: event.data.completed_at,
    },
  })

  const serializedRunStep = serializeRunStep({ runStep })

  controller.enqueue({
    ...event,
    data: serializedRunStep,
  })

  return serializedRunStep
}
