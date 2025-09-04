import type OpenAI from 'openai'

export const serializeMessage = ({
  message,
}: {
  message: OpenAI.ChatCompletionMessageParam
}) => {
  if (message.role === 'user') {
    return {
      role: 'user',
      content: message.content,
    }
  } else if (message.role === 'assistant') {
    return {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: message.content,
        },
        ...((message.tool_calls ?? [])
          .map((toolCall) => {
            if (toolCall.type === 'function') {
              return {
                type: 'tool_use',
                id: toolCall.id,
                name: toolCall.function.name,
                input: toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {},
              }
            }

            if (toolCall.type === 'custom') {
              let input: any = {}
              try {
                input = toolCall.custom.input ? JSON.parse(toolCall.custom.input) : {}
              } catch {
                input = toolCall.custom.input ?? {}
              }
              return {
                type: 'tool_use',
                id: toolCall.id,
                name: toolCall.custom.name,
                input,
              }
            }

            return null
          })
          .filter(Boolean) as any[]),
      ],
    }
  } else if (message.role === 'tool') {
    return {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: message.tool_call_id,
          content: message.content,
        },
      ],
    }
  }
}
