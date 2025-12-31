import type OpenAI from 'openai'

export const serializeTools = ({
  tools,
}: {
  tools: OpenAI.Beta.Threads.Runs.RunCreateParams['tools']
}) => {
  if (!tools?.length) return {}

  return {
    tools: tools.map((tool) => ({
      type: tool.type,
      // @ts-ignore-next-line
      ...(tool[tool.type] || {}),
    }))
  }
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
