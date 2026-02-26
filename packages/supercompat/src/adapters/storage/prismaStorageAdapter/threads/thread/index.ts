import type { PrismaClient } from '@prisma/client'
import type { RequestHandler } from '@/types'
import { get } from './get'
import { post } from './post'
import { del } from './del'

export const thread = ({
  prisma,
}: {
  prisma: PrismaClient
}): { get: RequestHandler; post: RequestHandler; delete: RequestHandler } => ({
  get: get({ prisma }),
  post: post({ prisma }),
  delete: del({ prisma }),
})
