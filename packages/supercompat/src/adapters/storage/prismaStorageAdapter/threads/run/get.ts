import type OpenAI from 'openai'
import type { PrismaClient } from '@prisma/client'
import { serializeRun } from '../runs/serializeRun'

type GetResponse = Response & {
  json: () => Promise<ReturnType<OpenAI.Beta.Threads.Runs['retrieve']>>
}

export const get = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string): Promise<GetResponse> => {
  const url = new URL(urlString)

  const [, threadId, runId] = url.pathname.match(new RegExp('^/v1/threads/([^/]+)/runs/([^/]+)$'))!

  const run = await prisma.run.findUnique({
    where: {
      id: runId,
      threadId,
    },
  })

  return new Response(JSON.stringify(
    serializeRun({ run })
  ), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'openai-poll-after-ms': '5000',
    },
  })
}
