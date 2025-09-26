import type OpenAI from 'openai'
import type { Prisma, PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'
import { serializeThread } from './serializeThread'

type ThreadCreateResponse = Response & {
  json: () => Promise<OpenAI.Beta.Threads.Thread>
}

export const post = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (_urlString: string, options: RequestInit & { body?: string }): Promise<ThreadCreateResponse> => {
  if (!options.body) {
    throw new Error('No body provided')
  }

  const body = JSON.parse(options.body)

  const messages = (body.messages || []) as OpenAI.Beta.ThreadCreateParams.Message[]
  const metadataRecord = (body.metadata || {}) as Record<string, unknown>
  const assistantId = typeof metadataRecord.assistantId === 'string'
    ? metadataRecord.assistantId
    : undefined

  if (!assistantId) {
    throw new Error('assistantId is required to create a thread')
  }

  const initialCreatedAt = dayjs().subtract(messages.length, 'seconds')

  const messageData = messages.map((message, index) => ({
    role: message.role === 'user' ? 'USER' : 'ASSISTANT',
    content: [
      {
        type: 'text',
        text: {
          annotations: [],
          value: message.content,
        },
      },
    ] as Prisma.InputJsonValue,
    attachments: (message.attachments ?? []) as Prisma.InputJsonValue[],
    metadata: message.metadata as Prisma.InputJsonValue | undefined,
    createdAt: initialCreatedAt.add(index, 'seconds').toDate(),
  })) satisfies Prisma.MessageCreateWithoutThreadInput[]

  const threadData = {
    metadata: metadataRecord as Prisma.InputJsonValue,
    assistant: {
      connect: {
        id: assistantId,
      },
    },
    messages: {
      create: messageData,
    },
  } satisfies Prisma.ThreadCreateInput

  const thread = await prisma.thread.create({
    data: threadData,
  })

  return new Response(JSON.stringify(
    serializeThread({ thread }),
  ), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
