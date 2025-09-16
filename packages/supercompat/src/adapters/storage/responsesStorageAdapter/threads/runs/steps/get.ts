import type { OpenAI } from 'openai'
import { assign, last } from 'radash'
import { stepsRegexp } from '@/lib/steps/stepsRegexp'
import { serializeRunStep } from './serializeRunStep'

export const get = ({
  openai,
  openaiAssistant,
}: {
  openai: OpenAI
  openaiAssistant: OpenAI.Beta.Assistants.Assistant
}) => async (urlString: string) => {
  const url = new URL(urlString)

  const [, threadId, runId] = url.pathname.match(new RegExp(stepsRegexp))!

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

  return new Response(JSON.stringify({
    data: items.data.map((item) => serializeRunStep({
      item,
      threadId,
      openaiAssistant,
    })),
    has_more: items.has_more,
    last_id: last(items.data)?.id ?? null,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
