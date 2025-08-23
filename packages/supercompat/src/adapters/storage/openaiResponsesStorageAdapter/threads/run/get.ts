import OpenAI from 'openai'
import { runRegexp } from '@/lib/runs/runRegexp'
import { getRun } from '../runs/store'

export const get = ({ openai: _openai }: { openai: OpenAI }) => async (
  urlString: string,
): Promise<Response> => {
  const url = new URL(urlString)
  const [, _threadId, runId] = url.pathname.match(new RegExp(runRegexp))!
  const run = getRun(runId)
  return new Response(JSON.stringify(run ?? null), {
    status: run ? 200 : 404,
    headers: {
      'Content-Type': 'application/json',
      'openai-poll-after-ms': '5000',
    },
  })
}
