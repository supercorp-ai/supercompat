import type { PrismaClient } from '@prisma/client'
import { StorageAdapterArgs } from '@/types'
import { beta } from './beta'

export const prismaStorageAdapter = ({
  prisma,
}: {
  prisma: PrismaClient
}) => ({
  runAdapter,
}: StorageAdapterArgs) => ({
  beta: beta({ prisma, runAdapter }),
})
