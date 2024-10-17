import type OpenAI from 'openai'
// @ts-ignore-next-line
import type { PrismaClient, Run } from '@prisma/client'
import { assign, last } from 'radash'
import { runsRegexp } from '@/lib/runs/runsRegexp'
import { serializeRun } from './serializeRun'

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

  const runs = await prisma.run.findMany({
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
  })

  return new Response(JSON.stringify({
    data: runs.map((run: Run) => (
      serializeRun({ run })
    )),
    hasNextPage: () => runs.length === parseInt(limit),
    body: {
      // @ts-ignore-next-line
      last_id: last(runs)?.id ?? null,
    },
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
