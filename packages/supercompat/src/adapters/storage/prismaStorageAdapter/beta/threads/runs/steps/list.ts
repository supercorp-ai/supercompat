import type { PrismaClient } from '@prisma/client'
import type OpenAI from 'openai'
import { assign, last } from 'radash'
import { serializeRunStep } from './serializeRunStep'

export const list = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (...args: Parameters<OpenAI.Beta.Threads.Runs.Steps['list']>): Promise<ReturnType<OpenAI.Beta.Threads.Runs.Steps['list']>> => {
  const threadId = args[0]
  const runId = args[1]

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
  }, args[2] ?? {})

  const runSteps = await prisma.runStep.findMany({
    where: {
      threadId,
      runId,
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
    data: runSteps.map((runStep) => serializeRunStep({ runStep })),
    hasNextPage: () => runSteps.length === limit,
    body: {
      last_id: last(runSteps)?.id ?? null,
    },
  }
}
