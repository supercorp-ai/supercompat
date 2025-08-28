import type OpenAI from 'openai'
import type { RequestHandler } from '@/types'

export const createStepsHandlers = ({
  runSteps,
}: {
  runSteps: Map<string, OpenAI.Beta.Threads.Runs.RunStep[]>
}): { get: RequestHandler } => {
  const get: RequestHandler = async (url) => {
    const pathname = new URL(url).pathname
    const m = pathname.match(/^\/(?:v1|\/?openai)\/threads\/([^/]+)\/runs\/([^/]+)\/steps$/)!
    const runId = m[2]
    const steps = runSteps.get(runId) ?? []
    return new Response(
      JSON.stringify({ data: steps, has_more: false, last_id: steps.at(-1)?.id ?? null }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }
  return { get }
}

