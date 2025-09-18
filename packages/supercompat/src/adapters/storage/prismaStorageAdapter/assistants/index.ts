import type { PrismaClient } from '@prisma/client'
import { post } from './post'
import type { RequestHandler } from '@/types'

export const assistants = ({ prisma }: { prisma: PrismaClient }): { post: RequestHandler } => ({
  post: post({ prisma }),
})
