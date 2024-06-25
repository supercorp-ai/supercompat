import type { PrismaClient } from '@prisma/client'
import { StorageAdapterArgs } from '@/types'
// import { beta } from './beta'
import { threads } from './threads'

export const prismaStorageAdapter = ({
  prisma,
}: {
  prisma: PrismaClient
}) => ({
  runAdapter,
}: StorageAdapterArgs) => ({
  'https://api.openai.com/v1/threads': threads({ prisma }),
})
