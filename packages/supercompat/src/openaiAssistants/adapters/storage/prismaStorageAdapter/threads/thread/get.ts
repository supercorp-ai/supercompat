import type { PrismaClient } from '@prisma/client'
import { threadRegexp } from '@/lib/threads/threadRegexp'
import { serializeThread } from '../serializeThread'

export const get = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string) => {
  const url = new URL(urlString)
  const [, threadId] = url.pathname.match(new RegExp(threadRegexp))!

  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
  })

  if (!thread) {
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify(
    serializeThread({ thread }),
  ), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
