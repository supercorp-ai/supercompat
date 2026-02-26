import type { PrismaClient } from '@prisma/client'
import { messageRegexp } from '@/lib/messages/messageRegexp'
import { serializeMessage } from '../serializeMessage'

export const post = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string, options: RequestInit & { body?: string }) => {
  const url = new URL(urlString)
  const [, threadId, messageId] = url.pathname.match(new RegExp(messageRegexp))!

  if (!options.body) {
    throw new Error('Request body is required')
  }

  const body = JSON.parse(options.body)

  const message = await prisma.message.update({
    where: { id: messageId, threadId },
    data: {
      ...(body.metadata !== undefined && { metadata: body.metadata }),
    },
  })

  return new Response(JSON.stringify(
    serializeMessage({ message }),
  ), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
