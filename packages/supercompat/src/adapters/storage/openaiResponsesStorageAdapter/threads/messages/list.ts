import OpenAI from 'openai'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'
import dayjs from 'dayjs'

export const list = ({ openai }: { openai: OpenAI }) => async (
  urlString: string,
): Promise<Response> => {
  const url = new URL(urlString)
  const [, threadId] = url.pathname.match(new RegExp(messagesRegexp))!

  const base = (openai.baseURL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const res = await fetch(`${base}/conversations/${threadId}/items`, {
    headers: { Authorization: `Bearer ${openai.apiKey}` },
  })
  const data = await res.json()

  const messages = (data.data || []).map((item: any) => ({
    id: item.id,
    object: 'thread.message',
    created_at: item.created_at ?? dayjs().unix(),
    thread_id: threadId,
    role: item.role,
    content: (item.content || []).map((c: any) => ({
      type: 'text',
      text: { value: c.text, annotations: [] },
    })),
    metadata: {},
    assistant_id: null,
    run_id: null,
    attachments: [],
    status: 'completed',
    completed_at: item.completed_at ?? dayjs().unix(),
    incomplete_at: null,
    incomplete_details: null,
  }))

  return new Response(
    JSON.stringify({ object: 'list', data: messages, has_more: false }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}
