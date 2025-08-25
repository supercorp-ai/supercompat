import type OpenAI from 'openai'
// @ts-ignore-next-line
import type { PrismaClient } from '@prisma/client'
import { assign, last } from 'radash'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'
import { serializeMessage, PrismaMessage } from './serializeMessage'

type MessageCreateResponse = Response & {
  json: () => Promise<ReturnType<OpenAI.Beta.Threads.Messages['create']>>
}

export const get = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string): Promise<MessageCreateResponse> => {
  const url = new URL(urlString)

  const [, threadId] = url.pathname.match(new RegExp(messagesRegexp))!

  const {
    limit,
    order,
    after,
  } = assign({
    limit: '20',
    order: 'desc',
    // after: null,
  }, Object.fromEntries(url.searchParams))

  const pageSize = parseInt(limit)

  const messagesPlusOne = (await prisma.message.findMany({
    where: { threadId },
    take: pageSize + 1,
    orderBy: { createdAt: order as unknown as 'asc' | 'desc' },
    ...(after && {
      skip: 1,
      cursor: { id: after },
    }),
  })) as PrismaMessage[]

  const messages = messagesPlusOne.slice(0, pageSize)

  return new Response(JSON.stringify({
    data: messages.map((message: PrismaMessage) => serializeMessage({ message })),
    has_more: messagesPlusOne.length > pageSize,
    last_id: last(messages)?.id ?? null,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
