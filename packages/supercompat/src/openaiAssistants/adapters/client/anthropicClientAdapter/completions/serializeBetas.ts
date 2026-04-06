import type OpenAI from 'openai'

type AnthropicTool = {
  type: 'computer_20250124' | 'code_execution_20250825'
}

export const serializeBetas = ({
  tools = [],
}: {
  tools: (OpenAI.Beta.AssistantTool | AnthropicTool)[] | undefined
}) => {
  const betas = []

  if (tools.some((tool) => tool.type === 'computer_20250124')) {
    betas.push('computer-use-2025-01-24')
  }

  if (tools.some((tool) => tool.type === 'code_execution_20250825')) {
    betas.push('code-execution-2025-08-25')
  }

  if (!betas.length) {
    return {}
  }

  return {
    betas,
  }
}
