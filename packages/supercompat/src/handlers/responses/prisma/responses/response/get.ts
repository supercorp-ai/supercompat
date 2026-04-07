import type { PrismaClient } from '@prisma/client'
import { serializeResponse } from '../../../serializers/serializeResponse'

export const get = ({
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

  const response = await prisma.response.findUnique({
    where: { id: responseId },
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

  if (!response) {
    return new Response(JSON.stringify({ error: { message: 'Response not found', type: 'invalid_request_error' } }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify(serializeResponse({ response })), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
