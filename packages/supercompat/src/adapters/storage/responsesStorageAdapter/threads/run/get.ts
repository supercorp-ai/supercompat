import type OpenAI from 'openai'
import { runRegexp } from '@/lib/runs/runRegexp'
import { serializeResponseAsRun } from '@/lib/responses/serializeResponseAsRun'

type GetResponse = Response & {
  json: () => Promise<ReturnType<OpenAI.Beta.Threads.Runs['retrieve']>>
}

export const get = ({
  openai,
  openaiAssistant,
}: {
  openai: OpenAI
  openaiAssistant: OpenAI.Beta.Assistants.Assistant
}) => async (urlString: string): Promise<GetResponse> => {
  const url = new URL(urlString)

  const [, _threadId, runId] = url.pathname.match(new RegExp(runRegexp))!

  const response = await openai.responses.retrieve(runId)

  const data = serializeResponseAsRun({
    response,
    assistantId: openaiAssistant.id,
  })

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'openai-poll-after-ms': '5000',
    },
  })
}
