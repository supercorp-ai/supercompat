import OpenAI from 'openai'
import { runs } from '../../state'
import { runRegexp } from '@/lib/runs/runRegexp'

export const get = ({ openai }: { openai: OpenAI }) => async (
  urlString: string,
): Promise<Response> => {
  const url = new URL(urlString)
  const [, threadId, runId] = url.pathname.match(new RegExp(runRegexp))!
  const run = runs.get(runId)
  return new Response(JSON.stringify(run), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'openai-poll-after-ms': '5000' },
  })
}
