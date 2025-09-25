import { uid } from 'radash'
import type OpenAI from 'openai'

type ItemType = OpenAI.Conversations.ConversationItem | OpenAI.Responses.ResponseItem

const serializeContent = ({
  item,
}: {
  item: ItemType
}): OpenAI.Beta.Threads.Messages.MessageContent[] => {
  if (item.type === 'message') {
    return item.content.map((contentBlock) => {
      if (contentBlock.type === 'input_text') {
        return {
          type: 'text' as const,
          text: {
            value: contentBlock.text,
            annotations: [],
          },
        }
      } else if (contentBlock.type === 'output_text') {
        return {
          type: 'text' as const,
          text: {
            value: contentBlock.text,
            annotations: [],
          },
        }
      } else if (contentBlock.type === 'input_image') {
        return {
          type: 'image_file' as const,
          image_file: {
            file_id: contentBlock.file_id,
            detail: 'auto',
          },
        }
      }

      return null
    }).filter(Boolean) as OpenAI.Beta.Threads.Messages.TextContentBlock[]
  } else if (item.type === 'image_generation_call') {
    if (!item.result) return []

    return [{
      type: 'image_url' as const,
      image_url: {
        url: `data:image/${item.output_format};base64,${item.result}`,
        detail: 'auto' as const,
      },
    }]
  } else {
    return []
  }
}

const serializeAttachments = ({
  item,
}: {
  item: ItemType
}): OpenAI.Beta.Threads.Messages.Message['attachments'] => {
  if (item.type !== 'message') return []

  const inputFiles = item.content.filter((contentBlock) => (
    contentBlock.type === 'input_file' && contentBlock.file_id
  )) as OpenAI.Responses.ResponseInputFile[]

  return inputFiles.map((inputFile: OpenAI.Responses.ResponseInputFile) => ({
    file_id: inputFile.file_id!,
  }))
}

const serializeMetadata = ({
  item,
}: {
  item: ItemType
}): OpenAI.Beta.Threads.Messages.Message['metadata'] => {
  if (item.type === 'image_generation_call') {
    return {
      item: JSON.stringify({
        ...item,
        result: 'truncated',
      }),
    }
  }

  return {
    item: JSON.stringify(item),
  }
}
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
  openaiAssistant: Pick<OpenAI.Beta.Assistants.Assistant, 'id'>
  createdAt: number
  runId?: string | null
  status?: 'completed' | 'in_progress'
}): OpenAI.Beta.Threads.Message => ({
  id: item.id || uid(24),
  object: 'thread.message' as const,
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
