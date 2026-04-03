import type OpenAI from 'openai'
import dayjs from 'dayjs'
import { isArray } from 'radash'
import type { RunAdapterWithAssistant } from '@/types'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'
import { serializeItemAsMessage } from '@/lib/items/serializeItemAsMessage'

type MessageCreateResponse = Response & {
  json: () => Promise<OpenAI.Beta.Threads.Messages.Message>
}

const contentBlocksFromContent = ({
  content,
  addAnnotations = false,
}: {
  content: string | OpenAI.Beta.Threads.Messages.MessageContentPartParam[]
  addAnnotations?: boolean
}) => {
  if (isArray(content)) {
    return content.map((item) => {
      if (item.type === 'text') {
        const textItem: any = {
          type: 'input_text' as 'input_text',
          text: item.text,
        }
        if (addAnnotations) {
          textItem.annotations = []
        }
        return textItem
      }

      if (item.type === 'image_file') {
        return {
          type: 'input_image' as 'input_image',
          file_id: item.image_file.file_id,
          detail: item.image_file.detail ?? 'auto',
        }
      }

      if (item.type === 'image_url') {
        return {
          type: 'input_image' as 'input_image',
          image_url: item.image_url.url,
          detail: item.image_url.detail ?? 'auto',
        }
      }

      const textItem: any = {
        type: 'input_text' as 'input_text',
        text: '',
      }
      if (addAnnotations) {
        textItem.annotations = []
      }
      return textItem
    })
  }

  const textItem: any = {
    type: 'input_text' as 'input_text',
    text: content ?? '',
  }
  if (addAnnotations) {
    textItem.annotations = []
  }
  return [textItem]
}

const contentBlocksFromAttachments = ({
  attachments,
}: {
  attachments: OpenAI.Beta.Threads.Messages.MessageCreateParams.Attachment[]
}) => (
  attachments.map((attachment) => ({
    type: 'input_file' as const,
    file_id: attachment.file_id,
  }))
)

const messageContentBlocks = ({
  content,
  attachments,
  addAnnotations = false,
}: {
  content: string | OpenAI.Beta.Threads.Messages.MessageContentPartParam[]
  attachments: OpenAI.Beta.Threads.Messages.MessageCreateParams.Attachment[]
  addAnnotations?: boolean
}) => ([
  ...contentBlocksFromContent({ content, addAnnotations }),
  ...contentBlocksFromAttachments({ attachments }),
])
export const post = ({
  runAdapter,
  createResponseItems,
  addAnnotations = false,
}: {
  runAdapter: RunAdapterWithAssistant
  createResponseItems: OpenAI.Responses.ResponseInputItem[]
  addAnnotations?: boolean
}) => async (urlString: string, options: RequestInit & { body?: string }): Promise<MessageCreateResponse> => {
  const url = new URL(urlString)

  const [, threadId] = url.pathname.match(new RegExp(messagesRegexp))!

  if (typeof options.body !== 'string') {
    throw new Error('Request body is required')
  }

  const body = JSON.parse(options.body)
  const { role, content, attachments = [] } = body

  const item: OpenAI.Responses.ResponseInputItem.Message = {
    type: "message" as const,
    role,
    content: messageContentBlocks({
      content,
      attachments,
      addAnnotations,
    }),
  }

  createResponseItems.push(item)

  // const items = await openai.conversations.items.create(
  //   threadId,
  //   {
  //     items: [
  //     ],
  //   }
  // );
  //

  const openaiAssistant = await runAdapter.getOpenaiAssistant({ select: { id: true } })

  return new Response(JSON.stringify(
    serializeItemAsMessage({
      item,
      threadId,
      openaiAssistant,
      createdAt: dayjs().unix(),
    }),
  ), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
