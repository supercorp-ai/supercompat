import type { MemoryStore } from '../store'
import dayjs from 'dayjs'

const serialize = (s: any) => ({
  id: s.id,
  object: 'thread.run.step' as 'thread.run.step',
  created_at: dayjs(s.createdAt).unix(),
  assistant_id: s.assistantId,
  thread_id: s.threadId,
  run_id: s.runId,
  type: s.type.toLowerCase() as any,
  status: s.status.toLowerCase() as any,
  step_details: s.stepDetails,
  last_error: s.lastError ?? null,
  expires_at: s.expiredAt ?? null,
  cancelled_at: s.cancelledAt ?? null,
  failed_at: s.failedAt ?? null,
  completed_at: s.completedAt ?? null,
  metadata: s.metadata ?? null,
  usage: s.usage ?? null,
})

export const steps = ({ store }: { store: MemoryStore }) => ({
  get: async (urlString: string) => {
    const url = new URL(urlString)
    const pathname = url.pathname
    const threadId = pathname.match(/threads\/([^/]+)/)?.[1]!
    const runId = pathname.match(/runs\/([^/]+)/)?.[1]!
    const limit = parseInt(url.searchParams.get('limit') ?? '20')
    const order = (url.searchParams.get('order') ?? 'desc') as 'asc' | 'desc'
    const after = url.searchParams.get('after')
    const pageSize = Math.min(limit, 100)

    let items = store.runSteps.findMany({
      where: { threadId, runId },
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
})

export const step = ({ store }: { store: MemoryStore }) => ({
  get: async (urlString: string) => {
    const pathname = new URL(urlString).pathname
    const threadId = pathname.match(/threads\/([^/]+)/)?.[1]!
    const runId = pathname.match(/runs\/([^/]+)/)?.[1]!
    const stepId = pathname.match(/steps\/([^/]+)/)?.[1]!
    const record = store.runSteps.findUnique({ id: stepId, threadId, runId })
    if (!record) return new Response('Not found', { status: 404 })
    return new Response(JSON.stringify(serialize(record)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  },
})
