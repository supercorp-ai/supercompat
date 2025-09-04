import type OpenAI from 'openai'

const nonEmptyContent = ({
  message,
}: {
  message: OpenAI.Chat.ChatCompletionMessageParam
}): OpenAI.Chat.ChatCompletionMessageParam['content'] => {
  if (typeof message.content === 'string') {
    if (!/\S/.test(message.content)) {
      return '-'
    }
  }

  return message.content as OpenAI.Chat.ChatCompletionMessageParam["content"]
}

export const nonEmptyMessages = ({
  messages,
}: {
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
}) => {
  const result: OpenAI.Chat.ChatCompletionMessageParam[] = []

  messages.forEach((message: OpenAI.Chat.ChatCompletionMessageParam) => {
    const hasContent = 'content' in (message as any)
    const next = hasContent
      ? ({
        ...message,
        content: nonEmptyContent({ message }),
      } as any)
      : (message as any)

    result.push(next)
  })

  return result
}
