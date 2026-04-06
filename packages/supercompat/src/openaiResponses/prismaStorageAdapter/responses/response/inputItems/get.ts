import type { PrismaClient } from '@prisma/client'
import { serializeInputItem } from '../../../../serializers/serializeInputItem'

export const get = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string): Promise<Response> => {
  const url = new URL(urlString)
  const match = url.pathname.match(/\/responses\/([^/]+)\/input_items$/)
  if (!match) {
    return new Response('Not found', { status: 404 })
  }

  const responseId = match[1]

  const response = await prisma.response.findUnique({
    where: { id: responseId },
    select: { input: true },
  })

  if (!response) {
    return new Response(JSON.stringify({ error: { message: 'Response not found', type: 'invalid_request_error' } }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const rawInput = response.input as any
  const inputItems = Array.isArray(rawInput) ? rawInput : (rawInput ? [rawInput] : [])
  let allItems = inputItems.map((item: any, index: number) =>
    serializeInputItem({ item, index })
  )

  // Pagination support
  const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : undefined
  const after = url.searchParams.get('after')

  if (after) {
    const afterIndex = allItems.findIndex((item: any) => item.id === after)
    if (afterIndex >= 0) {
      allItems = allItems.slice(afterIndex + 1)
    }
  }

  const hasMore = limit != null && allItems.length > limit
  const data = limit != null ? allItems.slice(0, limit) : allItems

  return new Response(JSON.stringify({
    object: 'list',
    data,
    first_id: data.length > 0 ? (data[0].id ?? `input_0`) : null,
    last_id: data.length > 0 ? (data[data.length - 1].id ?? `input_${data.length - 1}`) : null,
    has_more: hasMore,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
