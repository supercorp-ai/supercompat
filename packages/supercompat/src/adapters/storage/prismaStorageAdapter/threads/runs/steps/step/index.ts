import type { PrismaClient } from '@prisma/client'
import type { RequestHandler } from '@/types'
import { get } from './get'

export const step = ({
  prisma,
}: {
  prisma: PrismaClient
}): { get: RequestHandler } => ({
  get: get({ prisma }),
})
