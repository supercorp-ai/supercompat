import type { PrismaClient } from '@prisma/client'
import { cancelRunRegexp } from '@/lib/runs/cancelRunRegexp'
import { serializeRun } from '../../runs/serializeRun'
import { mapPrismaRun } from '../../runs/mapPrismaRun'

export const post = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string) => {
  const url = new URL(urlString)
  const [, threadId, runId] = url.pathname.match(new RegExp(cancelRunRegexp))!

  const run = await prisma.run.update({
    where: { id: runId, threadId },
    data: {
      status: 'CANCELLED',
      cancelledAt: Math.floor(Date.now() / 1000),
    },
  })

  return new Response(JSON.stringify(
    serializeRun({ run: mapPrismaRun(run) }),
  ), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
