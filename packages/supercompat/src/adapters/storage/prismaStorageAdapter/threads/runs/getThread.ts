import type { PrismaClient } from '@prisma/client'

export const getThread = ({
  prisma,
  threadId,
}: {
  prisma: PrismaClient
  threadId: string
}) => async () => {
  return prisma.thread.findUnique({
    where: { id: threadId },
  })
}
