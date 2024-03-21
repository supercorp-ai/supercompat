import type OpenAI from 'openai'
import type { PrismaClient } from '@prisma/client'
import { serializeMessage } from './serializeMessage'

const messageContentBlocks = ({
  content,
}: {
  content: string
}) => ([
  {
    type: 'text',
    text: {
      value: content ?? '',
      annotations: [],
    },
  },
])

export const create = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (...args: Parameters<OpenAI.Beta.Threads.Messages['create']>): Promise<ReturnType<OpenAI.Beta.Threads.Messages['create']>> => {
  const threadId = args[0]
  const { content } = args[1]

  const message = await prisma.message.create({
    data: {
      threadId,
      content: messageContentBlocks({ content }),
      role: 'USER',
    },
  })

  return serializeMessage({ message })
}
