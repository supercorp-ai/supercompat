import OpenAI from 'openai'
import { runRegexp } from '@/lib/runs/runRegexp'

export const get = ({ openai }: { openai: OpenAI }) => async (
  urlString: string,
): Promise<Response> => {
  const url = new URL(urlString)
  const [, threadId, runId] = url.pathname.match(new RegExp(runRegexp))!
  const conversation = await (openai as any).conversations
    .retrieve(threadId)
    .catch(() => null)
  const runStr = (conversation?.metadata as Record<string, string> | undefined)?.[`run_${runId}`]
  const run = runStr ? JSON.parse(runStr) : null
  return new Response(JSON.stringify(run ?? null), {
    status: run ? 200 : 404,
    headers: {
      'Content-Type': 'application/json',
      'openai-poll-after-ms': '5000',
    },
  })
}
