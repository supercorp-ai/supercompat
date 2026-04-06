import type { OpenAI } from 'openai'
import dayjs from 'dayjs'

const serializeStatus = ({
  item,
  completedAt,
}: {
  item: OpenAI.Responses.ResponseReasoningItem
  completedAt: number | null
}) => {
  if (!item.status) {
    if (completedAt) {
      return 'completed' as const
    } else {
      return 'in_progress' as const
    }
  }

  if (item.status === 'incomplete') {
    return 'in_progress' as const
  }

  return item.status
}

export const serializeItemAsReasoningRunStep = ({
  item,
  openaiAssistant,
  threadId,
  runId,
  completedAt = dayjs().unix(),
}: {
  item: OpenAI.Responses.ResponseReasoningItem
  openaiAssistant: Pick<OpenAI.Beta.Assistants.Assistant, 'id'>
  threadId: string
  runId: string
  completedAt?: number | null
}) => {
  const toolCall: OpenAI.Beta.Threads.Runs.Steps.FunctionToolCall = {
    id: `ftc${item.id}`,
    type: 'function' as const,
    function: {
      name: 'reasoning',
      arguments: '{}',
      output: JSON.stringify({
        summary: item.summary,
        content: item.content,
        encrypted_content: item.encrypted_content,
      }),
    },
  }

  return {
    id: `fc${item.id}`,
    object: 'thread.run.step' as const,
    created_at: dayjs().unix(),
    assistant_id: openaiAssistant.id,
    thread_id: threadId,
    run_id: runId,
    status: serializeStatus({ item, completedAt }),
    last_error: null,
    expired_at: null,
    cancelled_at: null,
    failed_at: null,
    completed_at: completedAt,
    metadata: {},
    usage: null,
    type: 'tool_calls' as const,
    step_details: {
      type: 'tool_calls' as const,
      tool_calls: [toolCall],
    } satisfies OpenAI.Beta.Threads.Runs.Steps.ToolCallsStepDetails,
  }
}
