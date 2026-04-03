import type { PrismaClient } from '@prisma/client'
import { threadRegexp } from '@/lib/threads/threadRegexp'
import { serializeThread } from '../serializeThread'

export const post = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string, options: RequestInit & { body?: string }) => {
  const url = new URL(urlString)
  const [, threadId] = url.pathname.match(new RegExp(threadRegexp))!

  if (!options.body) {
    throw new Error('Request body is required')
  }

  const body = JSON.parse(options.body)

  const thread = await prisma.thread.update({
    where: { id: threadId },
    data: {
      ...(body.metadata !== undefined && { metadata: body.metadata }),
    },
  })

  return new Response(JSON.stringify(
    serializeThread({ thread }),
  ), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
