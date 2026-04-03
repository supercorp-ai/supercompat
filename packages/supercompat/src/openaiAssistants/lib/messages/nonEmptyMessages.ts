import type OpenAI from 'openai'

const nonEmptyContent = ({
  message,
}: {
  message: OpenAI.Chat.ChatCompletionMessageParam
}): OpenAI.Chat.ChatCompletionMessageParam['content'] => {
  if (message.content == null) {
    return '-'
  }

  if (typeof message.content === 'string') {
    if (!/\S/.test(message.content)) {
      return '-'
    }
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
      content: nonEmptyContent({ message }),
    } as ExtendedMessageParam)
  ))

  return result as OpenAI.Chat.ChatCompletionMessageParam[]
}
