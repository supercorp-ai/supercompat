import type { PrismaClient } from '@prisma/client'
import type { RequestHandler, RunAdapterPartobClient } from '@/types'
import { post } from './post'

export const createAndRun = ({
  prisma,
  runAdapter,
}: {
  prisma: PrismaClient
  runAdapter: RunAdapterPartobClient
}): { post: RequestHandler } => ({
  post: post({ prisma, runAdapter }),
})
