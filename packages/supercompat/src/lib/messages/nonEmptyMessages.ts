import type OpenAI from 'openai'
import { isEmpty, isArray } from 'radash'

const nonEmptyContent = ({
  message,
}: {
  message: OpenAI.Chat.ChatCompletionMessageParam
}): OpenAI.Chat.ChatCompletionMessageParam['content'] => {
  if (isEmpty(message.content)) {
    return '-'
  }

  if (isArray(message.content)) {
    return message.content.map((content) => {
      if (content.type === 'text') {
        if (isEmpty(content.text)) {
          return {
            type: 'text',
            text: '-',
          }
        } else {
          return content
        }
      } else {
        return content
      }
    }) as OpenAI.Chat.ChatCompletionMessageParam['content']
  }

  return message.content as OpenAI.Chat.ChatCompletionMessageParam["content"]
}

type ExtendedRole = OpenAI.Chat.ChatCompletionMessageParam['role'] | 'developer'

type ExtendedMessageParam = Omit<OpenAI.Chat.ChatCompletionMessageParam, 'role'> & {
  role: ExtendedRole
}

export const nonEmptyMessages = ({
  messages,
}: {
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
}) => {
  const result = [] as ExtendedMessageParam[]

  messages.forEach((message: OpenAI.Chat.ChatCompletionMessageParam) => (
    result.push({
      ...message,
      content: nonEmptyContent({ message }) as OpenAI.Chat.ChatCompletionMessageParam['content'],
    })
  ))

  return result
}
