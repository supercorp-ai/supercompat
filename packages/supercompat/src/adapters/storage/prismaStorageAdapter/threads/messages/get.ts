import type OpenAI from 'openai'
// @ts-ignore-next-line
import type { PrismaClient, Message } from '@prisma/client'
import { assign, last } from 'radash'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'
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

  const messagesPlusOne = await prisma.message.findMany({
    where: { threadId },
    take: pageSize + 1,
    orderBy: { createdAt: order === 'asc' ? 'asc' : 'desc' },
    ...(after && {
      skip: 1,
      cursor: { id: after },
    }),
  }) as Message[]

  const messages = messagesPlusOne.slice(0, pageSize)

  return new Response(JSON.stringify({
    object: 'list',
    data: messages.map((message: Message) => (
      serializeMessage({ message })
    )),
    first_id: messages[0]?.id ?? null,
    last_id: last(messages)?.id ?? null,
    has_more: messagesPlusOne.length > pageSize,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
