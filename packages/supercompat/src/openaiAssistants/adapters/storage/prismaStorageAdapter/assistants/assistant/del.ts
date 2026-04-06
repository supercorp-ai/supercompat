import type { PrismaClient } from '@prisma/client'
import { assistantRegexp } from '@/lib/assistants/assistantRegexp'

export const del = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string) => {
  const url = new URL(urlString)
  const [, assistantId] = url.pathname.match(new RegExp(assistantRegexp))!

  await prisma.assistant.delete({
    where: { id: assistantId },
  })

  return new Response(JSON.stringify({
    id: assistantId,
    object: 'assistant.deleted',
    deleted: true,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
