/**
 * Azure Responses run adapter for the Responses API surface.
 *
 * Calls Azure's native Responses API directly and streams events through.
 * Uses AIProjectClient.getOpenAIClient() to obtain an authenticated OpenAI client,
 * since the supercompat client wrapper doesn't handle Azure auth for direct API calls.
 */
import type OpenAI from 'openai'
import type { AIProjectClient } from '@azure/ai-projects'
import { RunAdapterBody, GetOpenaiAssistantFn } from '@/types'

// Fields from Assistants API Run objects that the Responses API doesn't accept
const ASSISTANTS_ONLY_FIELDS = [
  'id', 'object', 'created_at', 'thread_id', 'assistant_id', 'status',
  'required_action', 'last_error', 'expires_at', 'started_at', 'cancelled_at',
  'failed_at', 'completed_at', 'incomplete_details', 'max_completion_tokens',
  'max_prompt_tokens', 'usage', 'response_format', 'truncation_strategy',
  'parallel_tool_calls',
]

export const azureResponsesRunAdapter = ({
  azureAiProject,
  getOpenaiAssistant,
}: {
  azureAiProject: AIProjectClient
  getOpenaiAssistant?: GetOpenaiAssistantFn
}) => ({
  type: 'responses-azure' as const,

  ...(getOpenaiAssistant ? { getOpenaiAssistant } : {}),

  handleRun: async ({
    body,
    onEvent,
  }: {
    client?: OpenAI
    body: RunAdapterBody
    onEvent: (event: OpenAI.Responses.ResponseStreamEvent) => Promise<void>
  }) => {
    const azureClient: OpenAI = await (azureAiProject as any).getOpenAIClient()

    const requestBody = { ...body, stream: true }
    for (const key of ASSISTANTS_ONLY_FIELDS) {
      delete requestBody[key]
    }

    const response = await azureClient.responses.create(requestBody) as unknown as AsyncIterable<OpenAI.Responses.ResponseStreamEvent>

    for await (const event of response) {
      await onEvent(event)
    }
  },
})
