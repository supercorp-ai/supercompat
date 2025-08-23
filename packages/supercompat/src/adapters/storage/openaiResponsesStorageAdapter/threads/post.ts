import OpenAI from 'openai'
import { uid } from 'radash'
import dayjs from 'dayjs'
import { threads } from '../state'

export const post = ({ openai }: { openai: OpenAI }) => async (
  urlString: string,
  options: any,
): Promise<Response> => {
  const body = options?.body ? JSON.parse(options.body) : {}

  const base = (openai.baseURL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const convRes = await fetch(`${base}/conversations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openai.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ metadata: body.metadata || {} }),
  })
  const conversation = await convRes.json()

  const thread = {
    id: conversation.id ?? uid(24),
    object: 'thread',
    created_at: conversation.created_at ?? dayjs().unix(),
    metadata: body.metadata || {},
    tool_resources: null,
    openaiConversationId: conversation.id ?? null,
  } as any

  threads.set(thread.id, thread)

  return new Response(JSON.stringify(thread), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
