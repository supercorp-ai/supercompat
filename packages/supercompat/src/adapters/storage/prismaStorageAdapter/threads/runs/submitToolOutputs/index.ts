import type { PrismaClient } from '@prisma/client'
import type { RunAdapter } from '@/types'
import { post } from './post'
import type { RequestHandler } from '@/types'

export const submitToolOutputs = ({
  prisma,
  runAdapter,
}: {
  prisma: PrismaClient
  runAdapter: RunAdapter
}): { post: RequestHandler } => ({
  post: post({
    prisma,
    // @ts-ignore-next-line
    runAdapter,
  }),
})
