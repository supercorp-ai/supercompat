import type OpenAI from 'openai'
import { assign } from 'radash'
import dayjs from 'dayjs'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'
import { serializeItemAsMessage } from '@/lib/items/serializeItemAsMessage'
import { responseId } from '@/lib/items/responseId'

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

  const conversation = await openai.conversations.retrieve(threadId)
  const items = await openai.conversations.items.list(threadId, {
    limit: parseInt(limit),
    after,
    order: order as 'asc' | 'desc',
  })

  console.dir({ conversation, items }, { depth: null })
  const initialCreatedAt = dayjs(conversation.created_at).add(items.data.length, 'seconds').format()
  const messageItems = items.data.filter((item) => (
    item.type !== 'function_call'
  ))

  // console.dir({ items }, { depth: null })
  return new Response(JSON.stringify({
    data: items.data.map((item: OpenAI.Conversations.ConversationItem, index) => (
      serializeItemAsMessage({
        item,
        threadId,
        openaiAssistant,
        createdAt: dayjs(initialCreatedAt).subtract(index, 'seconds').unix(),
        runId: item.id ? responseId({
          conversation,
          itemId: item.id,
        }) : null,
      })
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
