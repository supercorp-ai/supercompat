import dayjs from 'dayjs'
import { uid } from 'radash'
import type OpenAI from 'openai'

type RunStep = OpenAI.Beta.Threads.Runs.RunStep
type FunctionToolCall = OpenAI.Beta.Threads.Runs.Steps.FunctionToolCall
type ToolCallsStepDetails = OpenAI.Beta.Threads.Runs.Steps.ToolCallsStepDetails

type ConvItem = OpenAI.Conversations.ConversationItem

type ConvMessageItem = Extract<ConvItem, { type: 'message' }>
type ConvFnItem      = Extract<ConvItem, { type: 'function_call' }>

const isConvMessage = (i: ConvItem): i is ConvMessageItem =>
  'type' in i && i.type === 'message'

const isConvFn = (i: ConvItem): i is ConvFnItem =>
  'type' in i && i.type === 'function_call'

// If the SDK marks these optional, assert once after narrowing:
type ConvFnWithArgs = ConvFnItem & { name: string; arguments: string }

export function serializeRunStep({
  item,
  threadId,
  openaiAssistant,
}: {
  item: ConvItem
  threadId: string
  openaiAssistant: OpenAI.Beta.Assistants.Assistant
}): RunStep {
  const now = dayjs().unix()
  const runId = `run_${uid(24)}`

  // Normalize the item id to a definite string
  const itemId: string = typeof item.id === 'string' ? item.id : `item_${uid(18)}`

  const base: Omit<RunStep, 'type' | 'step_details'> = {
    id: itemId, // <- always string
    object: 'thread.run.step',
    created_at: now,
    assistant_id: openaiAssistant.id,
    thread_id: threadId,
    run_id: runId,
    status: 'completed',
    last_error: null,
    expired_at: null,
    cancelled_at: null,
    failed_at: null,
    completed_at: now,
    metadata: {},
    usage: null,
  }

  if (isConvMessage(item)) {
    return {
      ...base,
      type: 'message_creation',
      step_details: {
        type: 'message_creation',
        message_creation: {
          // If you also create a thread.message elsewhere, substitute that id here.
          message_id: itemId, // <- always string
        },
      },
      // keep role if present (assistant/user/system), optional
      metadata: 'role' in item ? { role: (item as any).role } : {},
    }
  }

  if (isConvFn(item)) {
    const fn = item as ConvFnWithArgs

    const toolCall: FunctionToolCall = {
      // prefer itemId; if your client also exposes a separate call_id, you could fall back to it
      id: itemId,
      type: 'function',
      function: {
        name: fn.name,
        arguments: fn.arguments,
        output: null, // required by Assistants; fill when submitting tool outputs
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

  // Fallback: treat unknown items as message_creation
  return {
    ...base,
    type: 'message_creation',
    step_details: {
      type: 'message_creation',
      message_creation: { message_id: itemId },
    },
  }
}
