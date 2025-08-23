import OpenAI from 'openai'
import { runs } from '../../state'
import { runsRegexp } from '@/lib/runs/runsRegexp'

export const get = ({ openai }: { openai: OpenAI }) => async (
  urlString: string,
): Promise<Response> => {
  const url = new URL(urlString)
  const [, threadId, runId] = url.pathname.match(new RegExp(runsRegexp))!
  const run = runs.get(runId)
  return new Response(JSON.stringify(run), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
