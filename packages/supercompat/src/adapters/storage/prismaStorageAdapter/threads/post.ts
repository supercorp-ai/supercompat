import type OpenAI from 'openai'
import type { PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'
import { serializeThread } from './serializeThread'

type ThreadCreateResponse = Response & {
  json: () => Promise<OpenAI.Beta.Threads['create']>
}

export const post =
  ({ prisma }: { prisma: PrismaClient }) =>
  async (
    ...args: Parameters<OpenAI.Beta.Threads['create']>
  ): Promise<ThreadCreateResponse> => {
    // @ts-ignore-next-line
    const body = JSON.parse(args[1].body)

    const messages = body.messages || []
    const metadata = body.metadata || {}
    const initialCreatedAt = dayjs()
      .subtract(messages.length, 'seconds')
      .format()

    const thread = await prisma.thread.create({
      data: {
        metadata: metadata as any,
        messages: {
          create: messages.map(
            (
              message: OpenAI.Beta.ThreadCreateParams.Message,
              index: number,
            ) => ({
              role: message.role === 'user' ? 'USER' : 'ASSISTANT',
              content: [
                {
                  type: 'text',
                  text: {
                    annotations: [],
                    value: message.content,
                  },
                },
              ],
              attachments: message.attachments as any,
              metadata: message.metadata as any,
              createdAt: dayjs(initialCreatedAt).add(index, 'seconds').toDate(),
            }),
          ) as any,
        },
      } as any,
    })

    return new Response(JSON.stringify(serializeThread({ thread })), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
