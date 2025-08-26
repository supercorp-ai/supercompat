import OpenAI from 'openai'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'
import dayjs from 'dayjs'

export const post = ({ openai }: { openai: OpenAI }) => async (
  urlString: string,
  options: any,
): Promise<Response> => {
  const url = new URL(urlString)
  const [, threadId] = url.pathname.match(new RegExp(messagesRegexp))!
  const body = JSON.parse(options.body)
  const content = typeof body.content === 'string' ? body.content : ''
  const oai = openai as any
  await oai.conversations.items.create(threadId, {
    items: [
      {
        type: 'message',
        role: body.role,
        content: [{ type: 'input_text', text: content }],
      },
    ],
  })

  return new Response(
    JSON.stringify({
      id: `msg_${Date.now()}`,
      object: 'thread.message',
      created_at: dayjs().unix(),
      thread_id: threadId,
      role: body.role,
      content: [
        {
          type: 'text',
          text: { value: content, annotations: [] },
        },
      ],
      metadata: body.metadata || {},
      assistant_id: null,
      run_id: null,
      attachments: [],
      status: 'completed',
      completed_at: dayjs().unix(),
      incomplete_at: null,
      incomplete_details: null,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}
