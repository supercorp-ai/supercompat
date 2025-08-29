import type OpenAI from 'openai'
import type { RequestHandler } from '@/types'

export const createMessagesHandlers = ({
  openai,
  ensureConversation,
  getConversationId,
  serializeThreadMessage,
  convLastAssistant,
}: {
  openai: OpenAI
  ensureConversation: (threadId: string) => Promise<string>
  getConversationId: (threadId: string) => Promise<string | null>
  serializeThreadMessage: ({ item, threadId }: { item: any; threadId: string }) => any
  convLastAssistant: Map<string, { id: string; text: string; created_at: number }>
}): { get: RequestHandler; post: RequestHandler } => {
  const get: RequestHandler = async (url) => {
    const pathname = new URL(url).pathname
    const m = pathname.match(/^\/(?:v1|\/?openai)\/threads\/([^/]+)\/messages$/)!
    const threadId = m[1]
    const combined: any[] = []
    const convId = await getConversationId(threadId)
    if (convId) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const list = await openai.conversations.items.list(convId, { order: 'asc' })
          for await (const it of list) {
            if ((it as any).type === 'message') {
              combined.push(serializeThreadMessage({ item: it, threadId }))
            }
          }
          const hasAssistant = combined.some((m: any) => m.role === 'assistant')
          if (hasAssistant || attempt === 2) break
          await new Promise((r) => setTimeout(r, 120))
        } catch {
          await new Promise((r) => setTimeout(r, 120))
        }
      }
      // If no assistant text yet, try to synthesize from last function_call_output
      const hasAssistantWithText = combined.some(
        (m: any) => m.role === 'assistant' && ((m.content?.[0]?.text?.value ?? '').length > 0),
      )
      if (!hasAssistantWithText) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const list2 = await openai.conversations.items.list(convId, { order: 'asc' })
            let lastOutput: string | null = null
            for await (const it of list2) {
              if ((it as any).type === 'function_call_output' && typeof (it as any).output === 'string') {
                lastOutput = (it as any).output as string
              }
            }
            if (lastOutput) {
              combined.push({
                id: `msg_${Math.random().toString(36).slice(2)}`,
                object: 'thread.message',
                created_at: Math.floor(Date.now() / 1000),
                thread_id: threadId,
                completed_at: Math.floor(Date.now() / 1000),
                incomplete_at: null,
                incomplete_details: null,
                role: 'assistant',
                content: [{ type: 'text', text: { value: lastOutput, annotations: [] } }],
                assistant_id: null,
                run_id: null,
                attachments: [],
                status: 'completed',
                metadata: {},
              })
              break
            }
          } catch {}
          await new Promise((r) => setTimeout(r, 120))
        }
      }
    }
    // Fallback: cached last assistant (prefer conversation-scoped cache)
    const convForCache = await getConversationId(threadId)
    const last = (convForCache ? convLastAssistant.get(convForCache) : undefined)
    const hasAnyAssistant = combined.some((m: any) => m.role === 'assistant')
    if (last && !hasAnyAssistant) {
      combined.push({
        id: last.id,
        object: 'thread.message',
        created_at: last.created_at,
        thread_id: threadId,
        completed_at: last.created_at,
        incomplete_at: null,
        incomplete_details: null,
        role: 'assistant',
        content: [{ type: 'text', text: { value: last.text, annotations: [] } }],
        assistant_id: null,
        run_id: null,
        attachments: [],
        status: 'completed',
        metadata: {},
      })
    }
    // Ensure assistant messages have text
    for (let i = 0; i < combined.length; i++) {
      const m: any = combined[i]
      if (m?.role !== 'assistant') continue
      let txt = ''
      try {
        txt = String(m?.content?.[0]?.text?.value ?? '')
      } catch {}
      if (!txt) {
        const convForCache2 = await getConversationId(threadId)
        const cached = (convForCache2 ? convLastAssistant.get(convForCache2)?.text : '') ?? ''
        combined[i] = {
          ...m,
          content: [{ type: 'text', text: { value: cached, annotations: [] } }],
          status: 'completed',
        }
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
    let created: any
    for (let i = 0; i < 5; i++) {
      try {
        created = await openai.conversations.items.create(convId, {
          items: [{ type: 'message', role: body.role ?? 'user', content: contentItems } as any],
        })
        break
      } catch {
        await new Promise((r) => setTimeout(r, 150))
      }
    }
    const item = created?.data?.find?.((i: any) => i.type === 'message') ?? { type: 'message', role: body.role ?? 'user', content: contentItems }
    const msg = serializeThreadMessage({ item, threadId })
    return new Response(JSON.stringify(msg), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  return { get, post }
}
