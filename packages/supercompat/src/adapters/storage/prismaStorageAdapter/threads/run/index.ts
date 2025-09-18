import type { PrismaClient } from '@prisma/client'
import type { RunAdapter } from '@/types'
import { get } from './get'
// import { post } from './post'
import type { RequestHandler } from '@/types'

export const run = ({
  prisma,
  runAdapter,
}: {
  prisma: PrismaClient
  runAdapter: RunAdapter
}): { get: RequestHandler } => ({
  get: get({ prisma }),
  // post: post({ prisma, runAdapter }),
})
