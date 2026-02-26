import type { PrismaClient } from '@prisma/client'
import { stepRegexp } from '@/lib/steps/stepRegexp'
import { serializeRunStep } from '../serializeRunStep'

export const get = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string) => {
  const url = new URL(urlString)
  const [, threadId, runId, stepId] = url.pathname.match(new RegExp(stepRegexp))!

  const runStep = await prisma.runStep.findUnique({
    where: { id: stepId, threadId, runId },
  })

  if (!runStep) {
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify(
    serializeRunStep({ runStep }),
  ), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
