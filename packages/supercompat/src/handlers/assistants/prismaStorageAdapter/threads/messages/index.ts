import type { PrismaClient } from '@prisma/client'
import { post } from './post'
import { get } from './get'
import type { RequestHandler } from '@/types'

export const messages = ({
  prisma,
}: {
  prisma: PrismaClient
}): { post: RequestHandler; get: RequestHandler } => ({
  post: post({ prisma }),
  get: get({ prisma }),
})
