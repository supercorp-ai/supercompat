import type { PrismaClient } from '@prisma/client'
import { threadRegexp } from '@/lib/threads/threadRegexp'

export const del = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string) => {
  const url = new URL(urlString)
  const [, threadId] = url.pathname.match(new RegExp(threadRegexp))!

  await prisma.thread.delete({
    where: { id: threadId },
  })

  return new Response(JSON.stringify({
    id: threadId,
    object: 'thread.deleted',
    deleted: true,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
