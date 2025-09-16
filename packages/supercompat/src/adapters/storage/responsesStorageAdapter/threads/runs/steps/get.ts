import type { OpenAI } from 'openai'
import { assign, last } from 'radash'
import { stepsRegexp } from '@/lib/steps/stepsRegexp'
import { serializeItemAsRunStep } from '@/lib/items/serializeItemAsRunStep'
import { responseId } from '@/lib/items/responseId'

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

  const response = await openai.responses.retrieve(runId)

  return new Response(JSON.stringify({
    data: response.output.map((item) => serializeItemAsRunStep({
      item,
      threadId,
      openaiAssistant,
      runId: response.id,
    })),
    has_more: false,
    last_id: last(response.output)?.id ?? null,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
