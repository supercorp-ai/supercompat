import type OpenAI from 'openai'

export const firstUserMessages = ({
  messages,
}: {
  messages: OpenAI.ChatCompletionMessageParam[]
}): OpenAI.ChatCompletionMessageParam[] => {
  const firstMessage = messages[0]
  if (!firstMessage) return messages

  if (firstMessage.role !== 'user') {
    return [
      {
        role: 'user',
        content: '-',
      } as OpenAI.ChatCompletionMessageParam,
      ...messages,
    ]
  }

  return messages
}
