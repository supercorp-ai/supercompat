import type OpenAI from 'openai'
import dayjs from 'dayjs'
import { isArray } from 'radash'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'
import { serializeItemAsMessage } from '@/lib/items/serializeItemAsMessage'
import { uid } from 'radash'

type MessageCreateResponse = Response & {
  json: () => Promise<OpenAI.Beta.Threads.Messages.Message>
}

const messageContentBlocks = ({
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

export const post = ({
  openai,
  openaiAssistant,
  createResponseItems,
}: {
  openai: OpenAI
  openaiAssistant: OpenAI.Beta.Assistants.Assistant
  createResponseItems: OpenAI.Responses.ResponseItem[]
}) => async (urlString: string, options: RequestInit & { body: string }): Promise<MessageCreateResponse> => {
  const url = new URL(urlString)

  const [, threadId] = url.pathname.match(new RegExp(messagesRegexp))!

  const body = JSON.parse(options.body)
  const { role, content, metadata } = body

  const item = {
    id: `msg_${uid(24)}`,
    status: 'in_progress' as const,
    type: "message" as const,
    role,
    content: messageContentBlocks({
      content,
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
