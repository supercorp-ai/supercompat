import type { PrismaClient } from '@prisma/client'
import { list } from './list'

export const steps = ({
  prisma,
}: {
  prisma: PrismaClient
}) => ({
  list: list({ prisma }),
})
