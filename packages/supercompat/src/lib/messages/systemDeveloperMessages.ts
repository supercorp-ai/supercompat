import type OpenAI from 'openai'
import { isOModel } from '@/lib/models/isOModel'

export const systemDeveloperMessages = ({
  messages,
  model,
}: {
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
  model: string
}): OpenAI.Chat.ChatCompletionMessageParam[] => {
  if (isOModel({ model })) {
    return messages.map((message) => {
      if (message.role === 'system') {
        return {
          ...message,
          // TODO: This should be 'developer' but we're using 'user' for now
          // role: 'developer',
          role: 'user',
        }
      }

      return message
    })
  }

  return messages
}
