import type OpenAI from 'openai'
// @ts-ignore-next-line
import type { PrismaClient, Message } from '@prisma/client'
import { assign, last } from 'radash'
import { serializeMessage } from './serializeMessage'

type MessageCreateResponse = Response & {
  json: () => Promise<ReturnType<OpenAI.Beta.Threads.Messages['create']>>
}

export const get = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string): Promise<MessageCreateResponse> => {
  const url = new URL(urlString)

  const [, threadId] = url.pathname.match(new RegExp('^/v1/threads/([^/]+)/messages$'))!

  const {
    limit,
    order,
    after,
  } = assign({
    limit: '20',
    order: 'desc',
    // after: null,
  }, Object.fromEntries(url.searchParams))

  const messages = await prisma.message.findMany({
    where: {
      threadId,
    },
    take: parseInt(limit),
    orderBy: {
      createdAt: order,
    },
    ...(after ? {
      skip: 1,
      cursor: {
        id: after,
      },
    }: {}),
  }) as Message[]

  return new Response(JSON.stringify({
    data: messages.map((message: Message) => (
      serializeMessage({ message })
    )),
    hasNextPage: () => messages.length === parseInt(limit),
    body: {
      last_id: last(messages)?.id ?? null,
    },
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
