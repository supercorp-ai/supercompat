import dayjs from 'dayjs'
import { isOpenaiComputerUseModel } from '@/lib/openaiComputerUse'
import { serializeOutputItem, type SerializableOutputItem } from './serializeOutputItem'
import { serializeTools } from './serializeTools'

export interface SerializableResponse {
  id: string
  createdAt: Date | string | number
  status: string
  error?: unknown
  instructions?: string | null
  maxOutputTokens?: number | null
  model: string
  temperature?: number | null
  topP?: number | null
  truncationType?: string | null
  truncationLastMessagesCount?: number | null
  textFormatType?: string | null
  textFormatSchema?: unknown
  usage?: unknown
  metadata?: unknown
  conversationId?: string | null
  outputItems?: SerializableOutputItem[]
  tools?: any[]
}

export const serializeResponse = ({
  response,
}: {
  response: SerializableResponse
}) => {
  const output = (response.outputItems ?? []).map((outputItem) =>
    serializeOutputItem({ outputItem })
  )

  const tools = response.tools
    ? serializeTools({
        tools: response.tools,
        useOpenaiComputerTool: isOpenaiComputerUseModel({
          model: response.model,
        }),
      })
    : []

  const truncation = (() => {
    switch (response.truncationType) {
      case 'AUTO':
        return { type: 'auto' as const }
      case 'LAST_MESSAGES':
        return {
          type: 'auto' as const,
          last_messages: response.truncationLastMessagesCount,
        }
      default:
        return { type: 'disabled' as const }
    }
  })()

  const text = (() => {
    if (response.textFormatType === 'json_schema') {
      return {
        format: {
          type: 'json_schema' as const,
          schema: response.textFormatSchema,
        },
      }
    }
    if (response.textFormatType === 'json_object') {
      return {
        format: {
          type: 'json_object' as const,
        },
      }
    }
    return {
      format: {
        type: 'text' as const,
      },
    }
  })()

  return {
    id: response.id,
    object: 'response' as const,
    created_at: dayjs(response.createdAt).unix(),
    status: response.status.toLowerCase(),
    error: response.error ?? null,
    incomplete_details: null,
    instructions: response.instructions ?? null,
    max_output_tokens: response.maxOutputTokens ?? null,
    model: response.model,
    output,
    parallel_tool_calls: true,
    previous_response_id: null,
    reasoning: { effort: null },
    store: true,
    temperature: response.temperature ?? 1,
    text,
    tool_choice: 'auto',
    tools,
    top_p: response.topP ?? 1,
    truncation,
    usage: response.usage ?? null,
    user: null,
    metadata: response.metadata ?? {},
    ...(response.conversationId
      ? { conversation: { id: response.conversationId } }
      : {}),
  }
}
