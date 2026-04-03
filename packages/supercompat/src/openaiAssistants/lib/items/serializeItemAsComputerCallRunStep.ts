import dayjs from 'dayjs'
import { uid } from 'radash'
import type OpenAI from 'openai'
import { getComputerCallActions } from '@/lib/openaiComputerUse'

type RunStep = OpenAI.Beta.Threads.Runs.RunStep
type FunctionToolCall = OpenAI.Beta.Threads.Runs.Steps.FunctionToolCall
type ToolCallsStepDetails = OpenAI.Beta.Threads.Runs.Steps.ToolCallsStepDetails

export const serializeItemAsComputerCallRunStep = ({
  item,
  items,
  threadId,
  openaiAssistant,
  runId = `run_${uid(24)}`,
  status = 'completed',
  completedAt = dayjs().unix(),
}: {
  item: OpenAI.Responses.ResponseComputerToolCall
  items: Omit<OpenAI.Responses.ResponseComputerToolCallOutputItem, 'id'>[]
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

  const computerCallOutput = items.find((i) => (
    i.type === 'computer_call_output' &&
    i.call_id === item.call_id
  )) as OpenAI.Responses.ResponseComputerToolCallOutputItem | undefined

  const actions = getComputerCallActions({
    item,
  })

  const toolCall: FunctionToolCall = {
    id: item.call_id,
    type: 'function',
    function: {
      name: 'computer_call',
      arguments: JSON.stringify({
        ...(actions.length === 1 ? { action: actions[0] } : {}),
        ...(actions.length > 0 ? { actions } : {}),
        pending_safety_checks: item.pending_safety_checks,
      }),
      output: computerCallOutput ? JSON.stringify(computerCallOutput.output) : null,
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
