import type { PrismaClient } from '@prisma/client'
import { serializeResponse } from '../../../../serializers/serializeResponse'

export const post = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string): Promise<Response> => {
  const url = new URL(urlString)
  const match = url.pathname.match(/\/responses\/([^/]+)\/cancel$/)
  if (!match) {
    return new Response('Not found', { status: 404 })
  }

  const responseId = match[1]

  const response = await prisma.response.update({
    where: { id: responseId },
    data: { status: 'CANCELLED' },
    include: {
      outputItems: { orderBy: { createdAt: 'asc' } },
      tools: {
        include: {
          functionTool: true,
          fileSearchTool: true,
          webSearchTool: true,
          codeInterpreterTool: true,
          computerUseTool: true,
        },
      },
    },
  })

  return new Response(JSON.stringify(serializeResponse({ response })), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
