import type { PrismaClient, RunStep } from '@prisma/client'
import { assign } from 'radash'
import { stepsRegexp } from '@/lib/steps/stepsRegexp'
import { serializeRunStep } from './serializeRunStep'

export const get = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string) => {
  const url = new URL(urlString)

  const [, threadId, runId] = url.pathname.match(new RegExp(stepsRegexp))!

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

  const runStepsPlusOne = await prisma.runStep.findMany({
    where: { threadId, runId },
    take: pageSize + 1,
    orderBy: { createdAt: order as 'asc' | 'desc' },
    ...(after && {
      skip: 1,
      cursor: { id: after },
    }),
  }) as RunStep[]

  const runSteps = runStepsPlusOne.slice(0, pageSize)

  return new Response(JSON.stringify({
    data: runSteps.map((runStep: RunStep) => serializeRunStep({ runStep })),
    has_more: runStepsPlusOne.length > pageSize,
    last_id: runSteps.at(-1)?.id ?? null,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
