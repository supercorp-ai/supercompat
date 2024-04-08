import type OpenAI from 'openai'

export const serializeTools = ({
  run
}: {
  run: OpenAI.Beta.Threads.Run
}) => (
  run.tools.map((tool: any) => {
    if (tool.type === 'function') {
      return {
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters,
      }
    }

    return tool
  })
)
