import type { PrismaClient } from '@prisma/client'
import { RunAdapter } from '@/types'
import { threads } from './threads'

export const beta = ({
  prisma,
  runAdapter,
}: {
  prisma: PrismaClient
  runAdapter: RunAdapter
}) => ({
  threads: threads({ prisma, runAdapter }),
})
