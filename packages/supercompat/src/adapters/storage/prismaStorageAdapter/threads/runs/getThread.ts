import type { PrismaClient } from '@prisma/client'
import { serializeThread } from '../serializeThread'
import type { ThreadWithConversationId } from '@/types'

export const getThread = ({
  prisma,
  threadId,
}: {
  prisma: PrismaClient
  threadId: string
}) =>
  async (): Promise<ThreadWithConversationId | null> => {
    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
    })

    return thread ? serializeThread({ thread }) : null
  }
