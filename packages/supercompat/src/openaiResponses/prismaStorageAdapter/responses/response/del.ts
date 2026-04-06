import type { PrismaClient } from '@prisma/client'

export const del = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string): Promise<Response> => {
  const url = new URL(urlString)
  const match = url.pathname.match(/\/responses\/([^/]+)$/)
  if (!match) {
    return new Response('Not found', { status: 404 })
  }

  const responseId = match[1]

  await prisma.response.delete({
    where: { id: responseId },
  })

  return new Response(JSON.stringify({
    id: responseId,
    object: 'response.deleted',
    deleted: true,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
