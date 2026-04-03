import type OpenAI from 'openai'
import type { RunAdapterWithAssistant } from '@/types'

type AssistantCreateResponse = Response & {
  json: () => Promise<OpenAI.Beta.Assistants.Assistant>
}

export const post =
  ({ runAdapter }: { runAdapter: RunAdapterWithAssistant }) =>
  async (
    _urlString: string,
    options: RequestInit & { body?: string },
  ): Promise<AssistantCreateResponse> => {
    // In Azure Agents, we don't actually create assistants - they're pre-configured in Azure
    // We just return a minimal assistant object with the ID that will be passed in subsequent calls
    // The assistant_id will be provided in the run creation requests

    if (typeof options.body !== 'string') {
      throw new Error('Request body is required')
    }

    const body = JSON.parse(options.body)

    // For Azure Agents, we don't create the assistant here
    // We just return a placeholder response since the actual agent is managed in Azure
    // The real assistant_id (Azure agent ID) will be provided when creating runs
    const openaiAssistant = {
      id: 'placeholder', // This will be overridden by the assistant_id passed to createRun
      object: 'assistant' as const,
      created_at: Math.floor(Date.now() / 1000),
      name: body.name || null,
      description: body.description || null,
      model: body.model,
      instructions: body.instructions || null,
      tools: body.tools || [],
      metadata: body.metadata || {},
      top_p: body.top_p ?? null,
      temperature: body.temperature ?? null,
      response_format: body.response_format || 'auto',
    }

    return new Response(JSON.stringify(openaiAssistant), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
