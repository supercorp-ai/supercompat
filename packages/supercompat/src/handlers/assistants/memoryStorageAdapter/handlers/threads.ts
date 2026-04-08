import type { MemoryStore } from '../store'
import dayjs from 'dayjs'

const serialize = (t: any) => {
  let metadata = t.metadata
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata) && 'assistantId' in metadata) {
    const { assistantId, ...rest } = metadata as Record<string, unknown>
    metadata = Object.keys(rest).length > 0 ? rest : null
  }
  return {
    id: t.id,
    object: 'thread' as 'thread',
    created_at: dayjs(t.createdAt).unix(),
    metadata,
    tool_resources: {
      code_interpreter: { file_ids: [] },
      file_search: { vector_store_ids: [] },
    },
  }
}

export const threads = ({ store }: { store: MemoryStore }) => ({
  post: async (_url: string, options: RequestInit & { body?: string }) => {
    const body = options.body ? JSON.parse(options.body) : {}
    const assistantId = body.metadata?.assistantId
    if (!assistantId) throw new Error('Thread requires metadata.assistantId')

    const thread = store.threads.create({
      assistantId,
      metadata: body.metadata ?? null,
    })

    // Create initial messages if provided
    if (body.messages?.length) {
      for (const msg of body.messages) {
        const content = typeof msg.content === 'string'
          ? [{ type: 'text', text: { value: msg.content, annotations: [] } }]
          : msg.content
        store.messages.create({
          threadId: thread.id,
          role: (msg.role || 'user').toUpperCase(),
          content,
          status: 'COMPLETED',
          metadata: msg.metadata ?? null,
          attachments: [],
        })
      }
    }

    return new Response(JSON.stringify(serialize(thread)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  },
})

export const thread = ({ store }: { store: MemoryStore }) => ({
  get: async (urlString: string) => {
    const id = new URL(urlString).pathname.match(/threads\/([^/]+)/)?.[1]!
    const record = store.threads.findUnique({ id })
    if (!record) return new Response('Not found', { status: 404 })
    return new Response(JSON.stringify(serialize(record)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  },
  post: async (urlString: string, options: RequestInit & { body?: string }) => {
    const id = new URL(urlString).pathname.match(/threads\/([^/]+)/)?.[1]!
    const body = JSON.parse(options.body!)
    const record = store.threads.update({ id }, {
      ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
    })
    return new Response(JSON.stringify(serialize(record)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  },
  delete: async (urlString: string) => {
    const id = new URL(urlString).pathname.match(/threads\/([^/]+)/)?.[1]!
    store.threads.delete({ id })
    return new Response(JSON.stringify({
      id,
      object: 'thread.deleted',
      deleted: true,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  },
})
