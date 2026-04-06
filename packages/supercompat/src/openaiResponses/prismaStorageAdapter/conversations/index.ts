import type { PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'
import type { RequestHandler } from '@/types'

const serializeConversation = (conv: any) => ({
  id: conv.id,
  object: 'conversation',
  created_at: dayjs(conv.createdAt).unix(),
  metadata: conv.metadata || {},
})

// POST /v1/conversations — create
export const createConversation = ({
  prisma,
}: {
  prisma: PrismaClient
}): RequestHandler => async (_urlString: string, options: any) => {
  const body = typeof options?.body === 'string' ? JSON.parse(options.body) : (options?.body || {})

  const conversation = await prisma.conversation.create({
    data: {
      metadata: body.metadata ?? undefined,
    },
  })

  return new Response(JSON.stringify(serializeConversation(conversation)), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// GET /v1/conversations/{id} — retrieve
export const getConversation = ({
  prisma,
}: {
  prisma: PrismaClient
}): RequestHandler => async (urlString: string) => {
  const url = new URL(urlString)
  const conversationId = url.pathname.split('/').pop()!

  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
  })

  return new Response(JSON.stringify(serializeConversation(conversation)), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// POST /v1/conversations/{id} — update
export const updateConversation = ({
  prisma,
}: {
  prisma: PrismaClient
}): RequestHandler => async (urlString: string, options: any) => {
  const url = new URL(urlString)
  const conversationId = url.pathname.split('/').pop()!
  const body = typeof options?.body === 'string' ? JSON.parse(options.body) : (options?.body || {})

  const conversation = await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      metadata: body.metadata ?? undefined,
    },
  })

  return new Response(JSON.stringify(serializeConversation(conversation)), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// DELETE /v1/conversations/{id} — delete
export const deleteConversation = ({
  prisma,
}: {
  prisma: PrismaClient
}): RequestHandler => async (urlString: string) => {
  const url = new URL(urlString)
  const conversationId = url.pathname.split('/').pop()!

  await prisma.conversation.delete({
    where: { id: conversationId },
  })

  return new Response(JSON.stringify({
    id: conversationId,
    object: 'conversation.deleted',
    deleted: true,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// POST /v1/conversations/{id}/items — create items
export const createConversationItems = ({
  prisma,
}: {
  prisma: PrismaClient
}): RequestHandler => async (urlString: string, options: any) => {
  const url = new URL(urlString)
  const parts = url.pathname.split('/')
  const conversationId = parts[parts.length - 2]
  const body = typeof options?.body === 'string' ? JSON.parse(options.body) : (options?.body || {})
  const items = body.items || []

  // Create a placeholder response to hold these items
  const response = await prisma.response.create({
    data: {
      model: '',
      status: 'COMPLETED',
      conversationId,
      input: items as any,
    },
  })

  // Create output items for each input
  const createdItems: any[] = []
  for (const item of items) {
    if (item.type === 'message') {
      const outputItem = await prisma.responseOutputItem.create({
        data: {
          responseId: response.id,
          type: 'MESSAGE',
          status: 'COMPLETED',
          role: item.role || 'user',
          content: item.content as any,
        },
      })
      createdItems.push({
        id: outputItem.id,
        type: 'message',
        role: item.role || 'user',
        content: item.content,
        status: 'completed',
      })
    }
  }

  return new Response(JSON.stringify({
    data: createdItems,
    has_more: false,
    first_id: createdItems[0]?.id ?? null,
    last_id: createdItems[createdItems.length - 1]?.id ?? null,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// GET /v1/conversations/{id}/items/{item_id} — retrieve item
export const getConversationItem = ({
  prisma,
}: {
  prisma: PrismaClient
}): RequestHandler => async (urlString: string) => {
  const url = new URL(urlString)
  const parts = url.pathname.split('/')
  const itemId = parts[parts.length - 1]

  const item = await prisma.responseOutputItem.findUniqueOrThrow({
    where: { id: itemId },
  })

  return new Response(JSON.stringify({
    id: item.id,
    type: item.type === 'MESSAGE' ? 'message' : 'function_call',
    role: item.role || 'assistant',
    content: item.content,
    status: item.status?.toLowerCase() || 'completed',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// DELETE /v1/conversations/{id}/items/{item_id} — delete item
export const deleteConversationItem = ({
  prisma,
}: {
  prisma: PrismaClient
}): RequestHandler => async (urlString: string) => {
  const url = new URL(urlString)
  const parts = url.pathname.split('/')
  const itemId = parts[parts.length - 1]
  const conversationId = parts[parts.length - 3]

  await prisma.responseOutputItem.delete({
    where: { id: itemId },
  })

  // Return the conversation (matches OpenAI API behavior)
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
  })

  return new Response(JSON.stringify(serializeConversation(conversation)), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// GET /v1/conversations/{id}/items — list items
export const listConversationItems = ({
  prisma,
}: {
  prisma: PrismaClient
}): RequestHandler => async (urlString: string) => {
  const url = new URL(urlString)
  const parts = url.pathname.split('/')
  // URL: /v1/conversations/{id}/items
  const conversationId = parts[parts.length - 2]

  // Get all responses in this conversation with their output items
  const responses = await prisma.response.findMany({
    where: { conversationId },
    include: { outputItems: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })

  // Build items list: input items from each response + output items
  const items: any[] = []

  for (const response of responses) {
    // Add input items
    const input = response.input as any
    if (Array.isArray(input)) {
      for (const item of input) {
        if (item.type === 'message') {
          items.push({
            id: `item_${items.length}`,
            type: 'message',
            role: item.role || 'user',
            content: Array.isArray(item.content) ? item.content : [{ type: 'input_text', text: typeof item.content === 'string' ? item.content : '' }],
          })
        }
      }
    } else if (typeof input === 'string') {
      items.push({
        id: `item_${items.length}`,
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: input }],
      })
    }

    // Add output items
    for (const outputItem of response.outputItems) {
      if (outputItem.type === 'MESSAGE') {
        items.push({
          id: outputItem.id,
          type: 'message',
          role: 'assistant',
          content: outputItem.content as any || [],
          status: outputItem.status?.toLowerCase() || 'completed',
        })
      } else if (outputItem.type === 'FUNCTION_CALL') {
        items.push({
          id: outputItem.id,
          type: 'function_call',
          call_id: outputItem.callId,
          name: outputItem.name,
          arguments: outputItem.arguments,
          status: outputItem.status?.toLowerCase() || 'completed',
        })
      }
    }
  }

  return new Response(JSON.stringify({
    data: items,
    has_more: false,
    first_id: items[0]?.id ?? null,
    last_id: items[items.length - 1]?.id ?? null,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
