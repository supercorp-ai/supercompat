import type { PrismaClient } from '@prisma/client'
import { RunAdapter } from '@/types'
import { create } from './create'
import { messages } from './messages'
import { runs } from './runs'

export const threads = ({
  prisma,
  runAdapter,
}: {
  prisma: PrismaClient
  runAdapter: RunAdapter
}) => ({
  create: create({ prisma }),
  messages: messages({ prisma }),
  runs: runs({ prisma, runAdapter }),
})
