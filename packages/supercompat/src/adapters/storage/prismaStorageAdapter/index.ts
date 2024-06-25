import type { PrismaClient } from '@prisma/client'
import { StorageAdapterArgs } from '@/types'
// import { beta } from './beta'
import { threads } from './threads'
import { messages } from './threads/messages'

export const prismaStorageAdapter = ({
  prisma,
}: {
  prisma: PrismaClient
}) => ({
  runAdapter,
}: StorageAdapterArgs) => ({
  '^https://api.openai.com/v1/threads$': threads({ prisma }),
  '^https://api.openai.com/v1/threads/([^/]+)/messages$': messages({ prisma }),
})
