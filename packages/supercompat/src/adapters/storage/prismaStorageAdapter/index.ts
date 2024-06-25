import OpenAI from 'openai'
import type { PrismaClient } from '@prisma/client'
import { StorageAdapterArgs } from '@/types'
// import { beta } from './beta'
// @ts-ignore-next-line
import type { Thread } from '@prisma/client'
import dayjs from 'dayjs'

export const serializeThread = ({
  thread,
}: {
  thread: Thread
}) => ({
  id: thread.id,
  object: 'thread' as 'thread',
  created_at: dayjs(thread.createdAt).unix(),
  metadata: thread.metadata,
  // TODO
  tool_resources: null,
})

export const prismaStorageAdapter = ({
  prisma,
}: {
  prisma: PrismaClient
}) => ({
  runAdapter,
}: StorageAdapterArgs) => ({
  'https://api.openai.com/v1/threads': {
    post: async (...args: Parameters<OpenAI.Beta.Threads['create']>): Promise<ReturnType<OpenAI.Beta.Threads['create']>> => {
      // @ts-ignore-next-line
      const body = JSON.parse(args[1].body)

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

      return new Response(JSON.stringify({
        data: serializeThread({ thread }),
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    },
  },
})
