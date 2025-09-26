import type { PrismaClient } from '@prisma/client'
import type { RequestHandler, RunAdapterPartobClient } from '@/types'
import { get } from './get'
// import { post } from './post'

export const run = ({
  prisma,
  runAdapter,
}: {
  prisma: PrismaClient
  runAdapter: RunAdapterPartobClient
}): { get: RequestHandler } => ({
  get: get({ prisma }),
  // post: post({ prisma, runAdapter }),
})
