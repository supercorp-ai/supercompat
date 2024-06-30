import type { PrismaClient } from '@prisma/client'
import { get } from './get'

export const steps = ({
  prisma,
}: {
  prisma: PrismaClient
}) => ({
  get: get({ prisma }),
})
