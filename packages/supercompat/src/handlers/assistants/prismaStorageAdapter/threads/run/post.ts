import type { PrismaClient } from '@prisma/client'
import { runRegexp } from '@/lib/runs/runRegexp'
import { serializeRun } from '../runs/serializeRun'
import { mapPrismaRun } from '../runs/mapPrismaRun'

export const post = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string, options: RequestInit & { body?: string }) => {
  const url = new URL(urlString)
  const [, threadId, runId] = url.pathname.match(new RegExp(runRegexp))!

  if (!options.body) {
    throw new Error('Request body is required')
  }

  const body = JSON.parse(options.body)

  const run = await prisma.run.update({
    where: { id: runId, threadId },
    data: {
      ...(body.metadata !== undefined && { metadata: body.metadata }),
    },
  })

  return new Response(JSON.stringify(
    serializeRun({ run: mapPrismaRun(run) }),
  ), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
