import type { PrismaClient } from '@prisma/client'
import { StorageAdapterArgs } from '@/types'
import { prismaStorageAdapter as assistantsPrismaStorageAdapter } from '@/handlers/assistants/prismaStorageAdapter'
import { prismaStorageAdapter as responsesPrismaStorageAdapter } from '@/handlers/responses/prisma'

export const prismaStorageAdapter = ({
  prisma,
}: {
  prisma: PrismaClient
}) => {
  const assistantsAdapter = assistantsPrismaStorageAdapter({ prisma })
  const responsesAdapter = responsesPrismaStorageAdapter({ prisma })

  return (args: StorageAdapterArgs) => {
    const assistants = assistantsAdapter(args)
    const responses = responsesAdapter(args)

    return {
      requestHandlers: {
        ...assistants.requestHandlers,
        ...responses.requestHandlers,
      },
    }
  }
}
