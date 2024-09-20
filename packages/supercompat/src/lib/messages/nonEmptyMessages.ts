import type OpenAI from 'openai'
import { isEmpty } from 'radash'

export const nonEmptyMessages = ({
  messages,
}: {
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
}) => {
  const result = [] as OpenAI.Chat.ChatCompletionMessageParam[]

  messages.forEach((message: OpenAI.Chat.ChatCompletionMessageParam) => (
    result.push({
      ...message,
      content: isEmpty(message.content) ? '-' : message.content as string,
    })
  ))

  return result
}
