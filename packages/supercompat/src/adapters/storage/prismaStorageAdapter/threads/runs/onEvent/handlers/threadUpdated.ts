import type { PrismaClient } from '@prisma/client'

export const threadUpdated = async ({
  prisma,
  event,
}: {
  prisma: PrismaClient
  event: any
  controller: ReadableStreamDefaultController<any>
}) => {
  const { id, openaiConversationId } = event.data || {}
  if (!id) return
  const thread = await prisma.thread.findUnique({ where: { id } })
  if (!thread) return
  await prisma.thread.update({
    where: { id },
    data: {
      metadata: {
        ...(thread.metadata as any),
        openaiConversationId,
      },
    },
  })
}
