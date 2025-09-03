import type OpenAI from 'openai'
import type { RequestHandler } from '@/types'

export const createMessagesHandlers = ({
  openai,
  ensureConversation,
  getConversationId,
  serializeThreadMessage,
  setLastUserText,
}: {
  openai: OpenAI
  ensureConversation: (threadId: string) => Promise<string>
  getConversationId: (threadId: string) => Promise<string | null>
  serializeThreadMessage: ({ item, threadId }: { item: any; threadId: string }) => any
  setLastUserText: (threadId: string, text: string) => void
}): { get: RequestHandler; post: RequestHandler } => {
  const get: RequestHandler = async (url) => {
    const pathname = new URL(url).pathname
    const m = pathname.match(/^\/(?:v1|\/?openai)\/threads\/([^/]+)\/messages$/)!
    const threadId = m[1]
    const combined: any[] = []
    const convId = await getConversationId(threadId)
    if (convId) {
      try {
        const list = await openai.conversations.items.list(convId, { order: 'asc' })
        for await (const it of list) {
          if ((it as any).type === 'message') {
            combined.push(serializeThreadMessage({ item: it, threadId }))
          }
        }
      } catch (err: any) {
        return new Response(JSON.stringify({ error: { message: err?.message ?? 'failed to list messages' } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    return new Response(JSON.stringify({ data: combined, has_more: false, last_id: combined.at(-1)?.id ?? null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const post: RequestHandler = async (url, options) => {
    const pathname = new URL(url).pathname
    const m = pathname.match(/^\/(?:v1|\/?openai)\/threads\/([^/]+)\/messages$/)!
    const threadId = m[1]
    const body = JSON.parse(options.body!)
    const convId = await ensureConversation(threadId)
    const contentItems = Array.isArray(body.content)
      ? body.content.map((c: any) => (c.type === 'text' ? { type: 'input_text', text: c.text } : c))
      : [{ type: 'input_text', text: String(body.content ?? '') }]
    const txt = String((contentItems.find((c: any) => c?.type === 'input_text')?.text ?? '') ?? '')
    if (txt) setLastUserText(threadId, txt)
    let created: any
    try {
      created = await openai.conversations.items.create(convId, {
        items: [{ type: 'message', role: body.role ?? 'user', content: contentItems } as any],
      })
    } catch (err: any) {
      return new Response(JSON.stringify({ error: { message: err?.message ?? 'failed to create message' } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const item = created?.data?.find?.((i: any) => i.type === 'message') ?? { type: 'message', role: body.role ?? 'user', content: contentItems }
    const msg = serializeThreadMessage({ item, threadId })
    return new Response(JSON.stringify(msg), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  return { get, post }
}
