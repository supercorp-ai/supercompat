import type OpenAI from 'openai'

export const serializeTools = ({
  tools,
}: {
  tools: OpenAI.Beta.AssistantTool[] | undefined
}) => (
  (tools ?? []).map((tool: OpenAI.Beta.AssistantTool) => {
    if (tool.type === 'function') {
      return {
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters ?? {
          type: 'object',
        },
      }
    }

    return {
      type: tool.type,
      // @ts-ignore-next-line
      ...(tool[tool.type] || {}),
    }
  })
)
