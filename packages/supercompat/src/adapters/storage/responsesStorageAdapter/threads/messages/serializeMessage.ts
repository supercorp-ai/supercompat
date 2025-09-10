import dayjs from 'dayjs'
import { uid } from 'radash'
import type OpenAI from 'openai'

const serializeContent = ({
  item,
}: {
  item: OpenAI.Conversations.ConversationItem
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
  item: OpenAI.Conversations.ConversationItem
}): OpenAI.Beta.Threads.Messages.Message['attachments'] => (
  []
)

const serializeMetadata = ({
  item,
}: {
  item: OpenAI.Conversations.ConversationItem
}): OpenAI.Beta.Threads.Messages.Message['metadata'] => (
  {}
)
  // assign(message.metadata as Record<any, any> ?? {}, message.toolCalls ? { toolCalls: message.toolCalls } : {}),

export const serializeMessage = ({
  item,
  initialCreatedAt,
  index,
  threadId,
}: {
  item: OpenAI.Conversations.ConversationItem
  initialCreatedAt: string
  index: number
  threadId: string
}): OpenAI.Beta.Threads.Message => ({
  id: item.id || uid(24),
  object: 'thread.message' as 'thread.message',
  created_at: dayjs(initialCreatedAt).add(index, 'seconds').unix(),
  thread_id: threadId,
  completed_at: null,
  incomplete_at: null,
  incomplete_details: null,
  role: typeof (item as any).role === 'string' ? (item as any).role : 'assistant',
  content: serializeContent({ item }),
  assistant_id: null,
  run_id: null,
  attachments: serializeAttachments({ item }),
  status: typeof (item as any).status === 'string' ? (item as any).status : 'completed',
  metadata: serializeMetadata({ item }),
})
