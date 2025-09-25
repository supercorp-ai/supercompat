import type { OpenAI } from 'openai'
import dayjs from 'dayjs'

const serializeStatus = ({
  item,
}: {
  item: OpenAI.Responses.ResponseItem.ImageGenerationCall
}) => {
  if (item.status === 'generating') {
    return 'in_progress' as const
  }

  return item.status
}

export const serializeItemAsImageGenerationRunStep = ({
  item,
  openaiAssistant,
  threadId,
  runId,
  completedAt = dayjs().unix(),
}: {
  item: OpenAI.Responses.ResponseItem.ImageGenerationCall
  openaiAssistant: Pick<OpenAI.Beta.Assistants.Assistant, 'id'>
  threadId: string
  runId: string
  completedAt?: number | null
}) => {
  const toolCall: OpenAI.Beta.Threads.Runs.Steps.FunctionToolCall = {
    id: `ftc${item.id}`,
    type: 'function' as const,
    function: {
      name: 'image_generation',
      arguments: '{}',
      output: JSON.stringify({
        status: item.status,
        background: item.background,
        output_format: item.output_format,
        quality: item.quality,
        result: item.result,
        size: item.size,
        revised_prompt: item.revised_prompt,
      })
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
