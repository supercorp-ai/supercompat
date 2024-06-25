import type { PrismaClient } from '@prisma/client'
import type { RunAdapter } from '@/types'
import { post } from './post'

export const runs = ({
  prisma,
  runAdapter,
}: {
  prisma: PrismaClient
  runAdapter: RunAdapter
}) => ({
  post: post({ prisma, runAdapter }),
})
