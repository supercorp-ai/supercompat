import type { OpenAI } from 'openai'
import dayjs from 'dayjs'

const serializeStatus = ({
  item,
}: {
  item: OpenAI.Responses.ResponseCodeInterpreterToolCall
}) => {
  if (item.status === 'incomplete') {
    return 'in_progress' as const
  } else if (item.status === 'interpreting') {
    return 'in_progress' as const
  }

  return item.status
}

const serializeOutput = ({
  output,
}: {
  output: OpenAI.Responses.ResponseCodeInterpreterToolCall.Logs
  // | OpenAI.Responses.ResponseCodeInterpreterToolCall.Image
}) => {
  // if (output.type === 'logs') {
    return {
      type: output.type,
      logs: output.logs,
    }
  // }

  // if (output.type === 'image') {
  //   return {
  //     type: output.type,
  //     image: {
  //       url: output.url,
  //     },
  //   }
  // }
}

const serializeOutputs = ({
  item,
}: {
  item: OpenAI.Responses.ResponseCodeInterpreterToolCall
}) => {
  if (!item.outputs) return []

  return (item.outputs.filter(o => o.type === 'logs') as OpenAI.Responses.ResponseCodeInterpreterToolCall.Logs[])
    .map((output) => serializeOutput({ output }))
}

export const serializeItemAsCodeInterpreterCallRunStep = ({
  item,
  openaiAssistant,
  threadId,
  runId,
  completedAt = dayjs().unix(),
}: {
  item: OpenAI.Responses.ResponseCodeInterpreterToolCall
  openaiAssistant: Pick<OpenAI.Beta.Assistants.Assistant, 'id'>
  threadId: string
  runId: string
  completedAt?: number | null
}) => {
  const toolCall: OpenAI.Beta.Threads.Runs.Steps.CodeInterpreterToolCall = {
    id: `citc${item.id}`,
    type: 'code_interpreter' as const,
    code_interpreter: {
      input: item.code ?? '',
      outputs: serializeOutputs({ item }),
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
    metadata: {
      item: JSON.stringify(item),
    },
    usage: null,
    type: 'tool_calls' as const,
    step_details: {
      type: 'tool_calls' as const,
      tool_calls: [toolCall],
    } satisfies OpenAI.Beta.Threads.Runs.Steps.ToolCallsStepDetails,
  }
}
