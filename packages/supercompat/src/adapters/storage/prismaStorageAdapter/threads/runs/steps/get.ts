// @ts-ignore-next-line
import type { PrismaClient, RunStep } from '@prisma/client'
import { assign, last } from 'radash'
import { stepsRegexp } from '@/lib/steps/stepsRegexp'
import { serializeRunStep } from './serializeRunStep'

export const get = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string) => {
  const url = new URL(urlString)

  const [, threadId,, runId] = url.pathname.match(new RegExp(stepsRegexp))!

  const {
    limit,
    order,
    after,
  } = assign({
    limit: '20',
    order: 'desc',
    // after: null,
  }, Object.fromEntries(url.searchParams))

  const runSteps = await prisma.runStep.findMany({
    where: {
      threadId,
      runId,
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
    data: runSteps.map((runStep: RunStep) => (
      serializeRunStep({ runStep })
    )),
    hasNextPage: () => runSteps.length === parseInt(limit),
    // @ts-ignore-next-line
    last_id: last(runSteps)?.id ?? null,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
