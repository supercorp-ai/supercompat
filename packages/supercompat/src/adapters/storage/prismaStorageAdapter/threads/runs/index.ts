import type { PrismaClient } from '@prisma/client'
import type { RunAdapterPartobClient } from '@/types'
import { get } from './get'
import { post } from './post'
import type { RequestHandler } from '@/types'

export const runs = ({
  prisma,
  runAdapter,
}: {
  prisma: PrismaClient
  runAdapter: RunAdapterPartobClient
}): { get: RequestHandler; post: RequestHandler } => ({
  get: get({ prisma }),
  post: post({ prisma, runAdapter }),
})
