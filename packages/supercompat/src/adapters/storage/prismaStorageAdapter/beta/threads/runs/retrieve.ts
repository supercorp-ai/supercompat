import type OpenAI from 'openai'
import type { PrismaClient } from '@prisma/client'
import { serializeRun } from './serializeRun'

export const retrieve = ({
  prisma,
}: {
  prisma: PrismaClient
}) => (...args: Parameters<OpenAI.Beta.Threads.Runs['retrieve']>): Promise<ReturnType<OpenAI.Beta.Threads.Runs['retrieve']>> => {
  const result = async () => {
    const threadId = args[0]
    const runId = args[1]

    const run = await prisma.run.findUnique({
      where: {
        id: runId,
        threadId,
      },
    })

    return {
      data: serializeRun({ run }),
      response: {
        headers: {
          get: (name: string) => {
            if (name === 'openai-poll-after-ms') {
              return '5000'
            }
          }
        },
      },
    }
  }

  result.withResponse = () => result()

  return result
}
