import type { OpenAI } from 'openai'
import dayjs from 'dayjs'

const serializeStatus = ({
  item,
}: {
  item: OpenAI.Responses.ResponseFunctionWebSearch
}) => {
  if (item.status === 'searching') {
    return 'in_progress' as const
  }

  return item.status
}

export const serializeItemAsWebSearchRunStep = ({
  item,
  openaiAssistant,
  threadId,
  runId,
  completedAt = dayjs().unix(),
}: {
  item: OpenAI.Responses.ResponseFunctionWebSearch
  openaiAssistant: Pick<OpenAI.Beta.Assistants.Assistant, 'id'>
  threadId: string
  runId: string
  completedAt?: number | null
}) => {
  const toolCall: OpenAI.Beta.Threads.Runs.Steps.FunctionToolCall = {
    id: `ftc${item.id}`,
    type: 'function' as const,
    function: {
      name: 'web_search',
      arguments: JSON.stringify({
        // @ts-expect-error bad openai types
        action: item.action,
      }),
      output: JSON.stringify({
        status: item.status,
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
    status: serializeStatus({ item }),
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
