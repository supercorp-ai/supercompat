import type { PrismaClient } from '@prisma/client'
import type { RunAdapter } from '@/types'
import { get } from './get'
import { post } from './post'

export const runs = ({
  prisma,
  runAdapter,
}: {
  prisma: PrismaClient
  runAdapter: RunAdapter
}) => ({
  get: get({ prisma }),
  post: post({ prisma, runAdapter }),
})
