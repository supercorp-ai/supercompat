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
}: {
  content: string | OpenAI.Beta.Threads.Messages.MessageContentPartParam[]
}) => {
  if (isArray(content)) {
    return content.map((item) => {
      if (item.type === 'text') {
        return {
          type: 'input_text' as 'input_text',
          text: item.text,
        }
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

      return {
        type: 'input_text' as 'input_text',
        text: '',
      }
    })
  }

  return [
    {
      type: 'input_text' as 'input_text',
      text: content ?? '',
    },
  ]
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
}: {
  content: string | OpenAI.Beta.Threads.Messages.MessageContentPartParam[]
  attachments: OpenAI.Beta.Threads.Messages.MessageCreateParams.Attachment[]
}) => ([
  ...contentBlocksFromContent({ content }),
  ...contentBlocksFromAttachments({ attachments }),
])
export const post = ({
  runAdapter,
  createResponseItems,
}: {
  runAdapter: RunAdapterWithAssistant
  createResponseItems: OpenAI.Responses.ResponseInputItem[]
}) => async (urlString: string, options: RequestInit & { body: string }): Promise<MessageCreateResponse> => {
  const url = new URL(urlString)

  const [, threadId] = url.pathname.match(new RegExp(messagesRegexp))!

  const body = JSON.parse(options.body)
  const { role, content, attachments = [] } = body

  const item: OpenAI.Responses.ResponseInputItem = {
    type: "message" as const,
    role,
    content: messageContentBlocks({
      content,
      attachments,
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
