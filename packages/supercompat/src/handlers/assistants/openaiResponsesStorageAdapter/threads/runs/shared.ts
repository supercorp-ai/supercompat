import type OpenAI from 'openai'
import { serializeComputerUseTool } from '@/lib/openaiComputerUse'

export const serializeTools = ({
  tools,
  useOpenaiComputerTool,
  toolResources,
}: {
  tools: OpenAI.Beta.Threads.Runs.RunCreateParams['tools']
  useOpenaiComputerTool: boolean
  toolResources?: any
}) => {
  if (!tools?.length) return {}

  const mapped = tools.map((tool) => {
      const toolType = (tool as any).type

      if (toolType === 'computer' || toolType === 'computer_use_preview') {
        const serialized = serializeComputerUseTool({
          useOpenaiComputerTool,
          tool: tool as unknown as Record<string, unknown>,
        })
        // Flatten nested Assistants format → flat Responses API format
        // { type: 'computer', computer: { ... } } → { type: 'computer' }
        // { type: 'computer_use_preview', computer_use_preview: { ... } } → { type: 'computer_use_preview', display_width, ... }
        if (serialized.type === 'computer') {
          return { type: 'computer' as const }
        }
        const config = (serialized as any).computer_use_preview ?? {}
        return { type: 'computer_use_preview' as const, ...config }
      }

      // Responses API code_interpreter requires container config
      if (toolType === 'code_interpreter') {
        return {
          type: 'code_interpreter',
          container: (tool as any).code_interpreter?.container ?? { type: 'auto' },
        }
      }

      // Responses API file_search needs vector_store_ids from tool_resources.
      // When no vector_store_ids are configured, skip the tool — the model
      // reads input_file content blocks directly without needing file_search.
      if (toolType === 'file_search') {
        const vectorStoreIds = toolResources?.file_search?.vector_store_ids ?? []
        if (vectorStoreIds.length === 0) return null
        return {
          type: 'file_search',
          vector_store_ids: vectorStoreIds,
        }
      }

      return {
        type: tool.type,
        // @ts-ignore-next-line
        ...(tool[tool.type] || {}),
      }
    }).filter(Boolean)

  return mapped.length > 0 ? { tools: mapped } : {}
}

export const truncation = ({
  truncation_strategy,
}: {
  truncation_strategy: OpenAI.Beta.Threads.Runs.RunCreateParams['truncation_strategy']
}) => {
  // @ts-expect-error compat
  if (truncation_strategy.type === 'disabled') {
    return 'disabled'
  }

  return 'auto'
}

export const textConfig = ({
  response_format,
}: {
  response_format: OpenAI.Beta.Threads.Runs.RunCreateParams['response_format']
}): OpenAI.Responses.ResponseTextConfig | undefined => {
  if (response_format && typeof response_format === 'object') {
    return {
      format: response_format as OpenAI.Responses.ResponseFormatTextConfig,
    }
  }
  return undefined
}

export const defaultAssistant = {
  model: '',
  instructions: '',
  additional_instructions: null,
  truncation_strategy: {
    type: 'auto',
  },
  response_format: {
    type: 'text',
  },
  // tools: [],
  // metadata: {},
}
