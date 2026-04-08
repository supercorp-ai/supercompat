import type { MemoryStore } from '../store'
import dayjs from 'dayjs'

const serialize = (a: any) => ({
  id: a.id,
  object: 'assistant' as 'assistant',
  created_at: dayjs(a.createdAt).unix(),
  name: a.name ?? null,
  description: a.description ?? null,
  model: a.modelSlug ?? '',
  instructions: a.instructions ?? null,
  tools: [],
  metadata: a.metadata ?? {},
  top_p: 1.0,
  temperature: 1.0,
  reasoning_effort: null,
  response_format: 'auto',
  tool_resources: {},
})

export const assistants = ({ store }: { store: MemoryStore }) => ({
  get: async (urlString: string) => {
    const url = new URL(urlString)
    const limit = parseInt(url.searchParams.get('limit') ?? '20')
    const order = (url.searchParams.get('order') ?? 'desc') as 'asc' | 'desc'
    const after = url.searchParams.get('after')
    const pageSize = Math.min(limit, 100)

    let items = store.assistants.findMany({
      orderBy: { createdAt: order },
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      take: pageSize + 1,
    })

    const hasMore = items.length > pageSize
    if (hasMore) items = items.slice(0, pageSize)

    const data = items.map(serialize)
    return new Response(JSON.stringify({
      object: 'list',
      data,
      first_id: data[0]?.id ?? null,
      last_id: data[data.length - 1]?.id ?? null,
      has_more: hasMore,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  },
  post: async (_url: string, options: RequestInit & { body?: string }) => {
    const body = JSON.parse(options.body!)
    const record = store.assistants.create({
      modelSlug: body.model,
      instructions: body.instructions ?? null,
      name: body.name ?? null,
      description: body.description ?? null,
      metadata: body.metadata ?? null,
    })
    return new Response(JSON.stringify(serialize(record)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  },
})

export const assistant = ({ store }: { store: MemoryStore }) => ({
  get: async (urlString: string) => {
    const id = new URL(urlString).pathname.split('/').pop()!
    const record = store.assistants.findUnique({ id })
    if (!record) return new Response('Not found', { status: 404 })
    return new Response(JSON.stringify(serialize(record)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  },
  post: async (urlString: string, options: RequestInit & { body?: string }) => {
    const id = new URL(urlString).pathname.split('/').pop()!
    const body = JSON.parse(options.body!)
    const record = store.assistants.update({ id }, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.instructions !== undefined ? { instructions: body.instructions } : {}),
      ...(body.model !== undefined ? { modelSlug: body.model } : {}),
      ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
    })
    return new Response(JSON.stringify(serialize(record)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  },
  delete: async (urlString: string) => {
    const id = new URL(urlString).pathname.split('/').pop()!
    store.assistants.delete({ id })
    return new Response(JSON.stringify({
      id,
      object: 'assistant.deleted',
      deleted: true,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  },
})
