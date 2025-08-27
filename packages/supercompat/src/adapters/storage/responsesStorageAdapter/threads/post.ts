import type OpenAI from 'openai'
import type { PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'
import { serializeThread } from './serializeThread'

type ThreadCreateResponse = Response & {
  json: () => Promise<OpenAI.Beta.Threads.Thread>
}

export const post = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string, options: RequestInit & { body: string }): Promise<ThreadCreateResponse> => {
  const body = JSON.parse(options.body)

  const messages = body.messages || []
  const metadata = body.metadata || {}

  const initialCreatedAt = dayjs().subtract(messages.length, 'seconds').format()

  const thread = await prisma.thread.create({
    data: {
      metadata,
      ...(metadata.assistantId ? ({
        assistant: {
          connect: {
            id: metadata.assistantId,
          },
        },
      }) : {}),
      messages: {
        create: messages.map((message: OpenAI.Beta.ThreadCreateParams.Message, index: number) => ({
          role: message.role === 'user' ? 'USER' : 'ASSISTANT',
          content: [{
              type: 'text',
              text: {
                annotations: [],
                value: message.content,
              },
            },
          ],
          attachments: message.attachments,
          metadata: message.metadata,
          createdAt: dayjs(initialCreatedAt).add(index, 'seconds').toDate(),
        })),
      },
    },
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
