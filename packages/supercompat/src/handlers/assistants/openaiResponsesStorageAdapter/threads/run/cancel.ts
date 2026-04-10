import type { OpenAI } from 'openai'
import type { RequestHandler, RunAdapterWithAssistant } from '@/types'
import { cancelRunRegexp } from '@/lib/runs/cancelRunRegexp'
import { serializeResponseAsRun } from '@/lib/responses/serializeResponseAsRun'

export const cancelRun = ({
  client,
  runAdapter,
}: {
  client: OpenAI
  runAdapter: RunAdapterWithAssistant
}): { post: RequestHandler } => ({
  post: async (urlString: string) => {
    const url = new URL(urlString)
    const [, threadId, runId] = url.pathname.match(new RegExp(cancelRunRegexp))!

    const openaiAssistant = await runAdapter.getOpenaiAssistant({ select: { id: true } })

    try {
      const response = await client.responses.cancel(runId)
      const run = serializeResponseAsRun({
        response: response as OpenAI.Responses.Response,
        assistantId: openaiAssistant.id,
      })
      return new Response(JSON.stringify(run), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch {
      // Responses API can't cancel non-streaming/completed responses.
      // Return a cancelled run to match Assistants API behavior.
      const response = await client.responses.retrieve(runId)
      const run = serializeResponseAsRun({
        response: response as OpenAI.Responses.Response,
        assistantId: openaiAssistant.id,
      })
      return new Response(JSON.stringify({
        ...run,
        status: 'cancelled',
        cancelled_at: Math.floor(Date.now() / 1000),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  },
})
