import type { PrismaClient } from '@prisma/client'
import { messageRegexp } from '@/lib/messages/messageRegexp'

export const del = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string) => {
  const url = new URL(urlString)
  const [, threadId, messageId] = url.pathname.match(new RegExp(messageRegexp))!

  await prisma.message.delete({
    where: { id: messageId, threadId },
  })

  return new Response(JSON.stringify({
    id: messageId,
    object: 'thread.message.deleted',
    deleted: true,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
