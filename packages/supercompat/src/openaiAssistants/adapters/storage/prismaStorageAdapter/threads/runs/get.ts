import type OpenAI from 'openai'
import type { PrismaClient, Run as PrismaRun } from '@prisma/client'
import { assign } from 'radash'
import { runsRegexp } from '@/lib/runs/runsRegexp'
import { serializeRun } from './serializeRun'
import { mapPrismaRun } from './mapPrismaRun'

type MessageCreateResponse = Response & {
  json: () => Promise<ReturnType<OpenAI.Beta.Threads.Messages['create']>>
}

export const get = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string): Promise<MessageCreateResponse> => {
  const url = new URL(urlString)

  const [, threadId] = url.pathname.match(new RegExp(runsRegexp))!

  const {
    limit,
    order,
    after,
  } = assign({
    limit: '20',
    order: 'desc',
    // after: null,
  }, Object.fromEntries(url.searchParams))

  const pageSize = parseInt(limit, 10)

  const runsPlusOne = await prisma.run.findMany({
    where: { threadId },
    take: pageSize + 1,
    orderBy: { createdAt: order === 'asc' ? 'asc' : 'desc' },
    ...(after && {
      skip: 1,
      cursor: { id: after },
    }),
  }) as PrismaRun[]

  const runs = runsPlusOne.slice(0, pageSize)

  return new Response(JSON.stringify({
    object: 'list',
    data: runs.map((run) => serializeRun({ run: mapPrismaRun(run) })),
    first_id: runs[0]?.id ?? null,
    last_id: runs.at(-1)?.id ?? null,
    has_more: runsPlusOne.length > pageSize,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
