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
}) => async (urlString: string, options: RequestInit & { body?: string }): Promise<ThreadCreateResponse> => {
  const body = JSON.parse(options.body || '{}')

  const messages = body.messages || []
  const metadata = body.metadata || {}

  const initialCreatedAt = dayjs().subtract(messages.length, 'seconds').format()

  const threadData: any = {
    metadata: (metadata || {}) as unknown as Prisma.InputJsonValue,
    messages: {
      create: messages.map((message: OpenAI.Beta.ThreadCreateParams.Message, index: number) => ({
        role: message.role === 'user' ? 'USER' : 'ASSISTANT',
        content: ([
          {
            type: 'text',
            text: {
              annotations: [],
              value: message.content as any,
            },
          },
        ] as unknown) as Prisma.InputJsonValue,
        attachments: (message.attachments || []) as any,
        metadata: (message.metadata || {}) as unknown as Prisma.InputJsonValue,
        createdAt: dayjs(initialCreatedAt).add(index, 'seconds').toDate(),
      })),
    },
  }

  if (metadata.assistantId) {
    threadData.assistant = { connect: { id: metadata.assistantId } }
  }

  const thread = await prisma.thread.create({ data: threadData })

  return new Response(JSON.stringify(
    serializeThread({ thread }),
  ), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
