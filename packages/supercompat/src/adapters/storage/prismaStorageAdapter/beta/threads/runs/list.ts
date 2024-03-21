import type { PrismaClient } from '@prisma/client'
import type OpenAI from 'openai'
import { assign, last } from 'radash'
import { serializeRun } from './serializeRun'

export const list = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (...args: Parameters<OpenAI.Beta.Threads.Runs['list']>): Promise<ReturnType<OpenAI.Beta.Threads.Runs['list']>> => {
  const threadId = args[0]

  const {
    // @ts-ignore-next-line
    limit,
    // @ts-ignore-next-line
    order,
  } = assign({
    // @ts-ignore-next-line
    limit: 20,
    order: 'desc',
  }, args[1] ?? {})

  const runs = await prisma.run.findMany({
    where: {
      threadId,
    },
    take: limit,
    orderBy: {
      createdAt: order,
    },
  })

  // @ts-ignore-next-line
  return {
    data: runs.map((run) => serializeRun({ run })),
    hasNextPage: () => false,
    body: {
      last_id: last(runs)?.id ?? null,
    },
  }
}
