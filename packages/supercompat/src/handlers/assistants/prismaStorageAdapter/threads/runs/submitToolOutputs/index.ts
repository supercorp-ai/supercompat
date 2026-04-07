import type { PrismaClient } from '@prisma/client'
import type { RequestHandler, RunAdapterPartobClient } from '@/types'
import { post } from './post'

export const submitToolOutputs = ({
  prisma,
  runAdapter,
}: {
  prisma: PrismaClient
  runAdapter: RunAdapterPartobClient
}): { post: RequestHandler } => ({
  post: post({
    prisma,
    // @ts-ignore-next-line
    runAdapter,
  }),
})
