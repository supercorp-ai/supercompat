import type { PrismaClient } from '@prisma/client'
import { StorageAdapterArgs } from '@/types'
import { threads } from './threads'
import { messages } from './threads/messages'
import { runs } from './threads/runs'
import { run } from './threads/run'

export const prismaStorageAdapter = ({
  prisma,
}: {
  prisma: PrismaClient
}) => ({
  runAdapter,
}: StorageAdapterArgs) => ({
  '^https://api.openai.com/v1/threads/([^/]+)/messages': messages({ prisma }),
  '^https://api.openai.com/v1/threads/([^/]+)/runs$': runs({ prisma, runAdapter }),
  '^https://api.openai.com/v1/threads/([^/]+)/runs/([^/]+)$': run({ prisma, runAdapter }),
  '^https://api.openai.com/v1/threads$': threads({ prisma }),
})
