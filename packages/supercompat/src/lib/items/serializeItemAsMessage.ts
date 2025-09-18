import dayjs from 'dayjs'
import { uid } from 'radash'
import type OpenAI from 'openai'

type ItemType = OpenAI.Conversations.ConversationItem | OpenAI.Responses.ResponseItem

const serializeContent = ({
  item,
}: {
  item: ItemType
}): OpenAI.Beta.Threads.Messages.TextContentBlock[] => {
  if (item.type !== 'message') return []

  return item.content.map((contentBlock) => {
    if (contentBlock.type === 'input_text') {
      return {
        type: 'text' as 'text',
        text: {
          value: contentBlock.text,
          annotations: [],
        },
      }
    } else if (contentBlock.type === 'output_text') {
      return {
        type: 'text' as 'text',
        text: {
          value: contentBlock.text,
          annotations: [],
        },
      }
    }

    return null
  }).filter(Boolean) as OpenAI.Beta.Threads.Messages.TextContentBlock[]
}

const serializeAttachments = ({
  item,
}: {
  item: ItemType
}): OpenAI.Beta.Threads.Messages.Message['attachments'] => (
  []
)

const serializeMetadata = ({
  item,
}: {
  item: ItemType
}): OpenAI.Beta.Threads.Messages.Message['metadata'] => (
  {
    item: JSON.stringify(item),
  }
)
  // assign(message.metadata as Record<any, any> ?? {}, message.toolCalls ? { toolCalls: message.toolCalls } : {}),

export const serializeItemAsMessage = ({
  item,
  threadId,
  openaiAssistant,
  createdAt,
  runId = null,
  status = 'completed',
}: {
  item: ItemType
  threadId: string
  openaiAssistant: OpenAI.Beta.Assistants.Assistant
  createdAt: number
  runId?: string | null
  status?: 'completed' | 'in_progress'
}): OpenAI.Beta.Threads.Message => ({
  id: item.id || uid(24),
  object: 'thread.message' as 'thread.message',
  created_at: createdAt,
  thread_id: threadId,
  completed_at: null,
  incomplete_at: null,
  incomplete_details: null,
  role: typeof (item as any).role === 'string' ? (item as any).role : 'assistant',
  content: serializeContent({ item }),
  assistant_id: (item as any).role === 'assistant' ? openaiAssistant.id : null,
  run_id: runId,
  attachments: serializeAttachments({ item }),
  status: typeof (item as any).status === 'string' ? (item as any).status : status,
  metadata: serializeMetadata({ item }),
})
