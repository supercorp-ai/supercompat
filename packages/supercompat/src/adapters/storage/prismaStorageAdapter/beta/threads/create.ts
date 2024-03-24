import type { PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'
import type OpenAI from 'openai'
import { serializeThread } from './serializeThread'

export const create = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (...args: Parameters<OpenAI.Beta.Threads['create']>): Promise<ReturnType<OpenAI.Beta.Threads['create']>> => {
  const {
    // @ts-ignore-next-line
    body: {
      messages,
      metadata,
    },
  } = args[0]

  const initialCreatedAt = dayjs().subtract(messages.length, 'seconds').format()

  const thread = await prisma.thread.create({
    data: {
      metadata,
      assistant: {
        connect: {
          id: metadata.superinterfaceAssistantId,
        },
      },
      messages: {
        create: messages.map((message: OpenAI.Beta.ThreadCreateParams.Message, index: number) => ({
          role: message.role,
          content: [{
              type: 'text',
              text: {
                annotations: [],
                value: message.content,
              },
            },
          ],
          fileIds: message.file_ids,
          metadata: message.metadata,
          createdAt: dayjs(initialCreatedAt).add(index, 'seconds').toDate(),
        })),
      },
    },
  })

  return serializeThread({ thread })
}
