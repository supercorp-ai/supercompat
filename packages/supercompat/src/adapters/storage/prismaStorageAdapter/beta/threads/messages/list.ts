import type { PrismaClient } from '@prisma/client'
import type OpenAI from 'openai'
import { assign, last } from 'radash'
import { serializeMessage } from './serializeMessage'

export const list = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (...args: Parameters<OpenAI.Beta.Threads.Messages['list']>): Promise<ReturnType<OpenAI.Beta.Threads.Messages['list']>> => {
  const threadId = args[0]
  const {
    // @ts-ignore-next-line
    limit,
    // @ts-ignore-next-line
    order,
    // @ts-ignore-next-line
    after,
  } = assign({
    // @ts-ignore-next-line
    limit: 20,
    order: 'desc',
    after: null,
  }, args[1] ?? {})

  const messages = await prisma.message.findMany({
    where: {
      threadId,
    },
    take: limit,
    orderBy: {
      createdAt: order,
    },
    ...(after ? {
      skip: 1,
      cursor: {
        id: after,
      },
    }: {}),
  })

  // @ts-ignore-next-line
  return {
    data: messages.map((message) => (
      serializeMessage({ message })
    )),
    hasNextPage: () => messages.length === limit,
    body: {
      last_id: last(messages)?.id ?? null,
    },
  }
}
