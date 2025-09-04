import type { PrismaClient } from '@prisma/client'
import { get } from './get'
// import { post } from './post'
import type { RequestHandler } from '@/types'

export const run = ({
  prisma,
}: {
  prisma: PrismaClient
}): { get: RequestHandler } => ({
  get: get({ prisma }),
  // post: post({ prisma, runAdapter }),
})
