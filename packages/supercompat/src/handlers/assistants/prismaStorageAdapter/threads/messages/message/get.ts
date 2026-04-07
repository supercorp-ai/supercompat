import type { PrismaClient } from '@prisma/client'
import { messageRegexp } from '@/lib/messages/messageRegexp'
import { serializeMessage } from '../serializeMessage'

export const get = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string) => {
  const url = new URL(urlString)
  const [, threadId, messageId] = url.pathname.match(new RegExp(messageRegexp))!

  const message = await prisma.message.findUnique({
    where: { id: messageId, threadId },
  })

  if (!message) {
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify(
    serializeMessage({ message }),
  ), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
