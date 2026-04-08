import type { RunAdapterWithAssistant } from '@/types'
import type { OpenAI } from 'openai'

type ListResponse = Response & {
  json: () => Promise<ReturnType<OpenAI.Beta.Assistants['list']>>
}

export const get = ({
  runAdapter,
}: {
  runAdapter: RunAdapterWithAssistant
}) => async (_urlString: string): Promise<ListResponse> => {
  return new Response(JSON.stringify({
    data: [await runAdapter.getOpenaiAssistant()],
    has_more: false,
    last_id: (await runAdapter.getOpenaiAssistant({ select: { id: true } })).id,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
