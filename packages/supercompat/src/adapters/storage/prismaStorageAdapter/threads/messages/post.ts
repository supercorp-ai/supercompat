import type OpenAI from 'openai'
import { isArray } from 'radash'
import type { PrismaClient } from '@prisma/client'
import { serializeMessage } from './serializeMessage'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'

type MessageCreateResponse = Response & {
  json: () => Promise<ReturnType<OpenAI.Beta.Threads.Messages['create']>>
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
          type: 'text',
          text: {
            value: item.text ?? '',
            annotations: [],
          },
        }
      }

      return item
    })
  }

  return [
    {
      type: 'text',
      text: {
        value: content ?? '',
        annotations: [],
      },
    },
  ]
}

export const post = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string, options: any): Promise<MessageCreateResponse> => {
  const url = new URL(urlString)

  const [, threadId] = url.pathname.match(new RegExp(messagesRegexp))!

  const body = JSON.parse(options.body)
  const { role, content, metadata } = body

  const message = await prisma.message.create({
    data: {
      threadId,
      content: messageContentBlocks({ content }),
      role: role === 'user' ? 'USER' : 'ASSISTANT',
      metadata: metadata || {},
    },
  })

  return new Response(JSON.stringify(
    serializeMessage({ message }),
  ), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
