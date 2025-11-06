import type OpenAI from 'openai'
import type { RunAdapterWithAssistant } from '@/types'

type AssistantCreateResponse = Response & {
  json: () => Promise<OpenAI.Beta.Assistants.Assistant>
}

export const post =
  ({ runAdapter }: { runAdapter: RunAdapterWithAssistant }) =>
  async (
    _urlString: string,
    _options: RequestInit & { body?: string },
  ): Promise<AssistantCreateResponse> => {
    const openaiAssistant = await runAdapter.getOpenaiAssistant()

    return new Response(JSON.stringify(openaiAssistant), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
