import type OpenAI from 'openai'

export const firstUserMessages = ({
  messages,
}: {
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
}): OpenAI.Chat.ChatCompletionMessageParam[] => {
  const firstMessage = messages[0]
  if (!firstMessage) return messages

  if (firstMessage.role !== 'user') {
    return [
      {
        role: 'user',
        content: '-',
      },
      ...messages,
    ]
  }

  return messages
}
