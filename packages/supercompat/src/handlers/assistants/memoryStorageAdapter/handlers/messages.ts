import type { MemoryStore } from '../store'
import dayjs from 'dayjs'
import { assign } from 'radash'

const serialize = (m: any) => ({
  id: m.id,
  object: 'thread.message' as 'thread.message',
  created_at: dayjs(m.createdAt).unix(),
  thread_id: m.threadId,
  completed_at: m.completedAt ? dayjs(m.completedAt).unix() : null,
  incomplete_at: m.incompleteAt ? dayjs(m.incompleteAt).unix() : null,
  incomplete_details: m.incompleteDetails ?? null,
  role: (m.role || 'user').toLowerCase() as 'user' | 'assistant',
  content: m.content,
  assistant_id: m.assistantId ?? null,
  run_id: m.runId ?? null,
  attachments: m.attachments ?? [],
  status: (m.status || 'completed').toLowerCase(),
  metadata: assign(m.metadata as Record<any, any> ?? {}, m.toolCalls ? { toolCalls: m.toolCalls } : {}),
})

export const messages = ({ store }: { store: MemoryStore }) => ({
  get: async (urlString: string) => {
    const url = new URL(urlString)
    const threadId = url.pathname.match(/threads\/([^/]+)/)?.[1]!
    const limit = parseInt(url.searchParams.get('limit') ?? '20')
    const order = (url.searchParams.get('order') ?? 'desc') as 'asc' | 'desc'
    const after = url.searchParams.get('after')
    const before = url.searchParams.get('before')
    const pageSize = Math.min(limit, 100)

    const itemsPlusOne = store.messages.findMany({
      where: { threadId },
      take: before ? -(pageSize + 1) : pageSize + 1,
      orderBy: { createdAt: order },
      ...(after ? { skip: 1, cursor: { id: after } } : {}),
      ...(before ? { skip: 1, cursor: { id: before } } : {}),
    })

    const items = itemsPlusOne.slice(0, pageSize)
    const hasMore = itemsPlusOne.length > pageSize
    const data = items.map(serialize)

    return new Response(JSON.stringify({
      object: 'list',
      data,
      first_id: data[0]?.id ?? null,
      last_id: data[data.length - 1]?.id ?? null,
      has_more: hasMore,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  },
  post: async (urlString: string, options: RequestInit & { body?: string }) => {
    const threadId = new URL(urlString).pathname.match(/threads\/([^/]+)/)?.[1]!
    const body = JSON.parse(options.body!)
    const content = typeof body.content === 'string'
      ? [{ type: 'text', text: { value: body.content, annotations: [] } }]
      : body.content
    const record = store.messages.create({
      threadId,
      role: (body.role || 'user').toUpperCase(),
      content,
      status: 'COMPLETED',
      metadata: body.metadata ?? null,
      attachments: body.attachments ?? [],
      assistantId: null,
      runId: null,
    })
    return new Response(JSON.stringify(serialize(record)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  },
})

export const message = ({ store }: { store: MemoryStore }) => ({
  get: async (urlString: string) => {
    const pathname = new URL(urlString).pathname
    const threadId = pathname.match(/threads\/([^/]+)/)?.[1]!
    const messageId = pathname.match(/messages\/([^/]+)/)?.[1]!
    const record = store.messages.findUnique({ id: messageId, threadId })
    if (!record) return new Response('Not found', { status: 404 })
    return new Response(JSON.stringify(serialize(record)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  },
  post: async (urlString: string, options: RequestInit & { body?: string }) => {
    const pathname = new URL(urlString).pathname
    const threadId = pathname.match(/threads\/([^/]+)/)?.[1]!
    const messageId = pathname.match(/messages\/([^/]+)/)?.[1]!
    const body = JSON.parse(options.body!)
    const record = store.messages.update({ id: messageId, threadId }, {
      ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
    })
    return new Response(JSON.stringify(serialize(record)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  },
  delete: async (urlString: string) => {
    const pathname = new URL(urlString).pathname
    const threadId = pathname.match(/threads\/([^/]+)/)?.[1]!
    const messageId = pathname.match(/messages\/([^/]+)/)?.[1]!
    store.messages.delete({ id: messageId, threadId })
    return new Response(JSON.stringify({
      id: messageId,
      object: 'thread.message.deleted',
      deleted: true,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  },
})
