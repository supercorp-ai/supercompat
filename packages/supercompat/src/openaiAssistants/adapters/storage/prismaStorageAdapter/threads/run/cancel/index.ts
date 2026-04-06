import type { PrismaClient } from '@prisma/client'
import type { RequestHandler } from '@/types'
import { post } from './post'

export const cancelRun = ({
  prisma,
}: {
  prisma: PrismaClient
}): { post: RequestHandler } => ({
  post: post({ prisma }),
})
