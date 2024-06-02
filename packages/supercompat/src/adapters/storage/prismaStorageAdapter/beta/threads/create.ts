import type { PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'
import type OpenAI from 'openai'
import { serializeThread } from './serializeThread'

export const create = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (...args: Parameters<OpenAI.Beta.Threads['create']>): Promise<ReturnType<OpenAI.Beta.Threads['create']>> => {
  // @ts-ignore-next-line
  const messages = args[0]?.messages || []
  // @ts-ignore-next-line
  const metadata = args[0]?.metadata || {}

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

  return serializeThread({ thread })
}
