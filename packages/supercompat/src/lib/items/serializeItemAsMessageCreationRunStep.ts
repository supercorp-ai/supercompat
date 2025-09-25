import dayjs from 'dayjs'
import { uid } from 'radash'
import type OpenAI from 'openai'

type RunStep = OpenAI.Beta.Threads.Runs.RunStep

export function serializeItemAsMessageCreationRunStep({
  item,
  threadId,
  openaiAssistant,
  runId = `run_${uid(24)}`,
  status = 'completed',
  completedAt = dayjs().unix(),
}: {
  item: OpenAI.Conversations.ConversationItem | OpenAI.Responses.ResponseItem | OpenAI.Responses.ResponseFunctionToolCall
  threadId: string
  openaiAssistant: OpenAI.Beta.Assistants.Assistant
  runId?: string
  status?: 'completed' | 'in_progress'
  completedAt?: number | null
}): RunStep {
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

  if (item.type === 'message') {
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
  } else if (item.type === 'image_generation_call') {
    return {
      ...base,
      type: 'message_creation',
      step_details: {
        type: 'message_creation',
        message_creation: { message_id: itemId },
      },
      metadata: {
        item: JSON.stringify({
          ...item,
          result: 'truncated',
        }),
      },
    }
  }

  return {
    ...base,
    type: 'message_creation',
    step_details: {
      type: 'message_creation',
      message_creation: { message_id: itemId },
    },
    metadata: {
      item: JSON.stringify(item),
    },
  }
}
