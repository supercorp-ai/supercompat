import OpenAI from 'openai'
import { assign } from 'radash'
import { stepsRegexp } from '@/lib/steps/stepsRegexp'

export const get = ({ openai }: { openai: OpenAI }) => async (
  urlString: string,
): Promise<Response> => {
  const url = new URL(urlString)
  const [, threadId, runId] = url.pathname.match(new RegExp(stepsRegexp))!
  const oai = openai as any
  const conversation = await oai.conversations
    .retrieve(threadId)
    .catch(() => null)
  const metadata = (conversation?.metadata ?? {}) as Record<string, string>
  const stepsStr = metadata[`run_${runId}_steps`]
  const allSteps = stepsStr ? JSON.parse(stepsStr) : []

  const { limit, order, after } = assign(
    { limit: '20', order: 'desc' },
    Object.fromEntries(url.searchParams),
  )
  const pageSize = parseInt(limit, 10)
  let steps = allSteps.sort((a: any, b: any) =>
    order === 'asc' ? a.created_at - b.created_at : b.created_at - a.created_at,
  )
  if (after) {
    const idx = steps.findIndex((s: any) => s.id === after)
    if (idx >= 0) steps = steps.slice(idx + 1)
  }
  const page = steps.slice(0, pageSize)
  return new Response(
    JSON.stringify({
      data: page,
      has_more: steps.length > pageSize,
      last_id: page.at(-1)?.id ?? null,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  )
}

