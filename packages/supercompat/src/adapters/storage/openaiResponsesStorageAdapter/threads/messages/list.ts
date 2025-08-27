import OpenAI from 'openai'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'
import dayjs from 'dayjs'

export const list = ({ openai }: { openai: OpenAI }) => async (
  urlString: string,
): Promise<Response> => {
  const url = new URL(urlString)
  const [, threadId] = url.pathname.match(new RegExp(messagesRegexp))!
  const oai = openai as any

  const conversation = await oai.conversations
    .retrieve(threadId)
    .catch(() => null)
  if (!conversation) return new Response('Not found', { status: 404 })

  const openaiConversationId =
    (conversation.metadata?.openaiConversationId as string) || threadId

  const items = await oai.conversations.items.list(openaiConversationId)

  const messages = (items.data || [])
    .filter((item: any) => item.type === 'message')
    .map((item: any) => ({
      id: item.id,
      object: 'thread.message',
      created_at: item.created_at ?? dayjs().unix(),
      thread_id: openaiConversationId,
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
    JSON.stringify({ object: 'list', data: messages, has_more: items.has_more ?? false }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}
