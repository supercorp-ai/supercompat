import type OpenAI from 'openai'
import { assign } from 'radash'
import dayjs from 'dayjs'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'
import { serializeMessage } from './serializeMessage'

type MessageCreateResponse = Response & {
  json: () => Promise<ReturnType<OpenAI.Beta.Threads.Messages['create']>>
}

export const get = ({
  openai,
  openaiAssistant,
}: {
  openai: OpenAI
  openaiAssistant: OpenAI.Beta.Assistants.Assistant
}) => async (urlString: string): Promise<MessageCreateResponse> => {
  const url = new URL(urlString)

  const [, threadId] = url.pathname.match(new RegExp(messagesRegexp))!

  const {
    limit,
    order,
    after,
  } = assign({
    limit: '20',
    order: 'desc',
    // after: null,
  }, Object.fromEntries(url.searchParams))

  const items = await openai.conversations.items.list(threadId, {
    limit: parseInt(limit),
    after,
    order: order as 'asc' | 'desc',
  })

  const initialCreatedAt = dayjs().subtract(items.data.length, 'seconds').format()

  return new Response(JSON.stringify({
    data: items.data.map((item: OpenAI.Conversations.ConversationItem, index) => (
      serializeMessage({ item, initialCreatedAt, index, threadId, openaiAssistant })
    )),
    has_more: items.has_more,
    last_id: items.last_id,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
