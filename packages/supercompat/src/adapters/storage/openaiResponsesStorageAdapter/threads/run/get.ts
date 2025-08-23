import OpenAI from 'openai'
import { runRegexp } from '@/lib/runs/runRegexp'

export const get = ({ openai }: { openai: OpenAI }) => async (
  urlString: string,
): Promise<Response> => {
  const url = new URL(urlString)
  const [, threadId, runId] = url.pathname.match(new RegExp(runRegexp))!
  const conversation = await openai.conversations.retrieve(threadId)
  const metadata = (conversation.metadata ?? {}) as Record<string, string>
  const runJson = metadata[`run_${runId}`]
  const run = runJson ? JSON.parse(runJson) : null
  return new Response(JSON.stringify(run), {
    status: run ? 200 : 404,
    headers: {
      'Content-Type': 'application/json',
      'openai-poll-after-ms': '5000',
    },
  })
}
