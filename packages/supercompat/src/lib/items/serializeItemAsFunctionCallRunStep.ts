import dayjs from 'dayjs'
import { uid } from 'radash'
import type OpenAI from 'openai'

type RunStep = OpenAI.Beta.Threads.Runs.RunStep
type FunctionToolCall = OpenAI.Beta.Threads.Runs.Steps.FunctionToolCall
type ToolCallsStepDetails = OpenAI.Beta.Threads.Runs.Steps.ToolCallsStepDetails

const serializeFunctionCallOutput = ({
  functionCallOutput,
}: {
  functionCallOutput: OpenAI.Responses.ResponseFunctionToolCallOutputItem | undefined
}) => {
  if (!functionCallOutput) return null
  if (typeof functionCallOutput.output === 'string') {
    return functionCallOutput.output
  }

  return JSON.stringify(functionCallOutput.output)
}

export const serializeItemAsFunctionCallRunStep = ({
  item,
  items,
  threadId,
  openaiAssistant,
  runId = `run_${uid(24)}`,
  status = 'completed',
  completedAt = dayjs().unix(),
}: {
  item: OpenAI.Responses.ResponseFunctionToolCall
  items: Omit<OpenAI.Responses.ResponseFunctionToolCallOutputItem, 'id'>[]
  threadId: string
  openaiAssistant: Pick<OpenAI.Beta.Assistants.Assistant, 'id'>
  runId?: string
  status?: 'completed' | 'in_progress'
  completedAt?: number | null
}): RunStep => {
  // Normalize the item id to a definite string
  const itemId: string = typeof item.id === 'string' ? item.id : `item_${uid(18)}`

  const base: Omit<RunStep, 'type' | 'step_details'> = {
    id: itemId,
    object: 'thread.run.step',
    created_at: dayjs().unix(),
    assistant_id: openaiAssistant.id,
    thread_id: threadId,
    run_id: runId,
    status,
    last_error: null,
    expired_at: null,
    cancelled_at: null,
    failed_at: null,
    completed_at: completedAt,
    metadata: {},
    usage: null,
  }

  const functionCallOutput = items.find((i) => (
    i.type === 'function_call_output' &&
    i.call_id === item.call_id
  )) as OpenAI.Responses.ResponseFunctionToolCallOutputItem | undefined

  const toolCall: FunctionToolCall = {
    id: item.call_id,
    type: 'function',
    function: {
      name: item.name,
      arguments: item.arguments,
      output: serializeFunctionCallOutput({ functionCallOutput }),
    },
  }

  return {
    ...base,
    type: 'tool_calls',
    step_details: {
      type: 'tool_calls',
      tool_calls: [toolCall],
    } satisfies ToolCallsStepDetails,
  }
}
