import type { PrismaClient } from '@prisma/client'
import { list } from './list'
import { create } from './create'

export const messages = ({
  prisma,
}: {
  prisma: PrismaClient
}) => ({
  list: list({ prisma }),
  create: create({ prisma }),
})
