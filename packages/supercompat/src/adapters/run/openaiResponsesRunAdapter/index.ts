/**
 * OpenAI run adapter for the Responses API surface.
 *
 * Calls OpenAI's native Responses API directly and streams events through.
 * Supports all built-in tools (web_search, file_search, code_interpreter, computer_use).
 *
 * When used with openaiResponsesStorageAdapter (Assistants surface), pass getOpenaiAssistant
 * so the storage adapter can resolve assistant data for building the request body.
 */
import type OpenAI from 'openai'
import { RunAdapterBody } from '@/types'

// Fields from Assistants API Run objects that the Responses API doesn't accept
const ASSISTANTS_ONLY_FIELDS = [
  'id', 'object', 'created_at', 'thread_id', 'assistant_id', 'status',
  'required_action', 'last_error', 'expires_at', 'started_at', 'cancelled_at',
  'failed_at', 'completed_at', 'incomplete_details', 'max_completion_tokens',
  'max_prompt_tokens', 'usage', 'response_format', 'truncation_strategy',
  'parallel_tool_calls',
]

export const openaiResponsesRunAdapter = ({
  getOpenaiAssistant,
  waitUntil,
}: {
  getOpenaiAssistant?: (args?: { select?: { id?: boolean } }) => Promise<OpenAI.Beta.Assistants.Assistant> | OpenAI.Beta.Assistants.Assistant | Pick<OpenAI.Beta.Assistants.Assistant, 'id'> | Promise<Pick<OpenAI.Beta.Assistants.Assistant, 'id'>>
  waitUntil?: <T>(p: Promise<T>) => void | Promise<void>
} = {}) => ({
  type: 'responses-openai' as const,

  ...(getOpenaiAssistant ? { getOpenaiAssistant } : {}),

  handleRun: async ({
    client,
    body,
    onEvent,
  }: {
    client: OpenAI
    body: RunAdapterBody
    onEvent: (event: OpenAI.Responses.ResponseStreamEvent) => Promise<void>
  }) => {
    const requestBody: Record<string, unknown> = { ...body, stream: true }
    for (const key of ASSISTANTS_ONLY_FIELDS) {
      delete requestBody[key]
    }

    const response = await client.responses.create(requestBody as OpenAI.Responses.ResponseCreateParams) as unknown as AsyncIterable<OpenAI.Responses.ResponseStreamEvent>

    for await (const event of response) {
      await onEvent(event)
    }
  },
})
