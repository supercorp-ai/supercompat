import type OpenAI from 'openai'
// @ts-ignore-next-line
import type { Run } from '@prisma/client'
import dayjs from 'dayjs'

const serializeStatus = ({
  response,
}: {
  response: OpenAI.Responses.Response
}): OpenAI.Beta.Threads.Run['status'] => {
  if (response.error) return 'failed'

  return (response.status?.toLowerCase() as 'completed' | 'failed' || 'completed')
}

const serializeUsage = ({
  response,
}: {
  response: OpenAI.Responses.Response
}) => ({
  prompt_tokens: response.usage?.input_tokens ?? 0,
  completion_tokens: response.usage?.output_tokens ?? 0,
  total_tokens: response.usage?.total_tokens ?? 0,
})

export const serializeResponseAsRun = ({
  response,
  assistantId,
}: {
  response: OpenAI.Responses.Response
  assistantId: string
}): OpenAI.Beta.Threads.Run => {
  const status = serializeStatus({ response })

  return {
    id: response.id,
    object: 'thread.run' as 'thread.run',
    created_at: response.created_at,
    thread_id: response.conversation!.id,
    assistant_id: assistantId,
    status,
    required_action: null,
    last_error: response.error as OpenAI.Beta.Threads.Run['last_error'],
    expires_at: response.created_at,
    started_at: response.created_at,
    cancelled_at: null,
    failed_at: response.error ? response.created_at : null,
    completed_at: status === 'completed' ? response.created_at : null,
    model: response.model,
    instructions: '',
    tools: [] as OpenAI.Beta.Threads.Run['tools'],
    metadata: response.metadata,
    usage: serializeUsage({ response }),
    truncation_strategy: {
      type: 'auto',
    },
    response_format: {
      type: 'text',
    },
    incomplete_details: null,
    max_completion_tokens: null,
    max_prompt_tokens: null,
    tool_choice: 'auto',
    parallel_tool_calls: true,
  }
}
