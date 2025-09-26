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
        ...(message.tool_calls ?? []).map((toolCall) => ({
          type: 'tool_use',
          id: toolCall.id,
          // @ts-expect-error todo
          name: toolCall.function.name,
          // @ts-expect-error todo
          input: toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {},
        })),
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
