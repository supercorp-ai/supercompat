import type { PrismaClient } from '@prisma/client'
import { post } from './post'
import { get } from './get'
import type { RequestHandler } from '@/types'

export const assistants = ({ prisma }: { prisma: PrismaClient }): { get: RequestHandler; post: RequestHandler } => ({
  get: get({ prisma }),
  post: post({ prisma }),
})
