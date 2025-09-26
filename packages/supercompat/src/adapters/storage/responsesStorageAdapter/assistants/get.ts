import type { RunAdapterWithAssistant } from '@/types'
import type { OpenAI } from 'openai'

type MessageCreateResponse = Response & {
  json: () => Promise<ReturnType<OpenAI.Beta.Threads.Messages['create']>>
}

export const get = ({
  runAdapter,
}: {
  runAdapter: RunAdapterWithAssistant
}) => async (urlString: string): Promise<MessageCreateResponse> => {
  return new Response(JSON.stringify({
    data: [await runAdapter.getOpenaiAssistant()],
    has_more: false,
    last_id: (await runAdapter.getOpenaiAssistant({ select: { id: true } })).id,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
