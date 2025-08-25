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
  const metadata = conversation?.metadata as Record<string, string> | undefined
  const runStr = metadata?.[`run_${runId}`]
  const toolsStr = metadata?.[`run_${runId}_tools`]
  const raStr = metadata?.[`run_${runId}_required_action`]
  const run = runStr
    ? {
        ...JSON.parse(runStr),
        tools: toolsStr ? JSON.parse(toolsStr) : [],
        ...(raStr ? { required_action: JSON.parse(raStr) } : {}),
      }
    : null
  return new Response(JSON.stringify(run ?? null), {
    status: run ? 200 : 404,
    headers: {
      'Content-Type': 'application/json',
      'openai-poll-after-ms': '5000',
    },
  })
}
