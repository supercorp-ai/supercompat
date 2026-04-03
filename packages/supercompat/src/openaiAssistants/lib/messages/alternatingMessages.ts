import type OpenAI from 'openai'

const agentSideRoles = ['assistant', 'system']

export const alternatingMessages = ({
  messages,
}: {
  messages: OpenAI.ChatCompletionMessageParam[]
}): OpenAI.ChatCompletionMessageParam[] => {
  const result: OpenAI.ChatCompletionMessageParam[] = []

  messages.forEach((message, index: number) => {
    result.push(message)

    const nextMessage = messages[index + 1]
    if (!nextMessage) return

    if (message.role === 'user' && nextMessage.role === 'user') {
      result.push({
        role: 'assistant',
        content: '-',
      } as OpenAI.ChatCompletionMessageParam)
    } else if (agentSideRoles.includes(message.role) && agentSideRoles.includes(nextMessage.role)) {
      result.push({
        role: 'user',
        content: '-',
      } as OpenAI.ChatCompletionMessageParam)
    }
  })

  return result
}
