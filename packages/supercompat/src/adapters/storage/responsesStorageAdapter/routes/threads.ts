import { uid } from 'radash'
import type { RequestHandler } from '@/types'

export const createThreadsHandlers = (): { post: RequestHandler } => {
  const post: RequestHandler = async (_url, options) => {
    const body = options.body ? JSON.parse(options.body) : {}
    const metadata = body.metadata ?? {}
    const id = `thread_${uid(24)}`
    return new Response(
      JSON.stringify({ id, object: 'thread', created_at: Math.floor(Date.now() / 1000), metadata }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }
  return { post }
}

