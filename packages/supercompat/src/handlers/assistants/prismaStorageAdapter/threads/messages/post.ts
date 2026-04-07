import type OpenAI from 'openai'
import { isArray } from 'radash'
import type { Prisma, PrismaClient } from '@prisma/client'
import { serializeMessage } from './serializeMessage'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'

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
}) => async (urlString: string, options: RequestInit & { body?: string }): Promise<MessageCreateResponse> => {
  const url = new URL(urlString)

  const [, threadId] = url.pathname.match(new RegExp(messagesRegexp))!

  if (!options.body) {
    throw new Error('Request body is required')
  }

  const body = JSON.parse(options.body)
  const { role, content, metadata } = body

  const message = await prisma.message.create({
    data: {
      threadId,
      content: messageContentBlocks({ content }) as Prisma.InputJsonValue,
      role: (role === 'user' ? 'USER' : 'ASSISTANT') as Prisma.MessageCreateWithoutThreadInput['role'],
      metadata: (metadata ?? {}) as Prisma.InputJsonValue,
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
