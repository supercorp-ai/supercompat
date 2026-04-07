import type { PrismaClient } from '@prisma/client'
import { get } from './get'
import type { RequestHandler } from '@/types'

export const steps = ({
  prisma,
}: {
  prisma: PrismaClient
}): { get: RequestHandler } => ({
  get: get({ prisma }),
})
