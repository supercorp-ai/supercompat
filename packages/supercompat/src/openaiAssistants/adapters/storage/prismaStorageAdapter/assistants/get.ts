// @ts-ignore-next-line
import type { PrismaClient, Assistant } from '@prisma/client'
import { assign } from 'radash'
import { serializeAssistant } from './serializeAssistant'

export const get = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string) => {
  const url = new URL(urlString)

  const {
    limit,
    order,
    after,
  } = assign({
    limit: '20',
    order: 'desc',
  }, Object.fromEntries(url.searchParams))

  const pageSize = parseInt(limit, 10)

  const assistantsPlusOne = await prisma.assistant.findMany({
    take: pageSize + 1,
    orderBy: { createdAt: order === 'asc' ? 'asc' : 'desc' },
    ...(after && {
      skip: 1,
      cursor: { id: after },
    }),
  }) as Assistant[]

  const assistants = assistantsPlusOne.slice(0, pageSize)

  return new Response(JSON.stringify({
    object: 'list',
    data: assistants.map((assistant: Assistant) => (
      serializeAssistant({ assistant })
    )),
    first_id: assistants[0]?.id ?? null,
    last_id: assistants.at(-1)?.id ?? null,
    has_more: assistantsPlusOne.length > pageSize,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
