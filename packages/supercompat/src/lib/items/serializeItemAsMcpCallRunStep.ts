import type { OpenAI } from 'openai'
import dayjs from 'dayjs'

const serializeStatus = ({
  item,
}: {
  item: OpenAI.Responses.ResponseItem.McpCall
}) => {
  if (item.error) {
    return 'failed' as const
  }

  return 'completed' as const
}

export const serializeItemAsMcpCallRunStep = ({
  item,
  openaiAssistant,
  threadId,
  runId,
  completedAt = dayjs().unix(),
}: {
  item: OpenAI.Responses.ResponseItem.McpCall
  openaiAssistant: Pick<OpenAI.Beta.Assistants.Assistant, 'id'>
  threadId: string
  runId: string
  completedAt?: number | null
}) => {
  const toolCall: OpenAI.Beta.Threads.Runs.Steps.FunctionToolCall = {
    id: `ftc${item.id}`,
    type: 'function' as const,
    function: {
      name: item.name,
      arguments: item.arguments,
      server_label: item.server_label,
      output: item.output ?? item.error ?? null,
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
    last_error: item.error ? { code: 'server_error' as const, message: item.error } : null,
    expired_at: null,
    cancelled_at: null,
    failed_at: item.error ? dayjs().unix() : null,
    completed_at: item.error ? null : completedAt,
    metadata: {},
    usage: null,
    type: 'tool_calls' as const,
    step_details: {
      type: 'tool_calls' as const,
      tool_calls: [toolCall],
    } satisfies OpenAI.Beta.Threads.Runs.Steps.ToolCallsStepDetails,
  }
}
