import type OpenAI from 'openai'

const agentSideRoles = ['assistant', 'system']

export const alternatingMessages = ({
  messages,
}: {
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
}) => {
  const result = [] as OpenAI.Chat.ChatCompletionMessageParam[]

  messages.forEach((message: OpenAI.Chat.ChatCompletionMessageParam, index: number) => {
    result.push(message)

    const nextMessage = messages[index + 1]
    if (!nextMessage) return

    if (message.role === 'user' && nextMessage.role === 'user') {
      result.push({
        role: 'assistant',
        content: '-',
      })
    } else if (agentSideRoles.includes(message.role) && agentSideRoles.includes(nextMessage.role)) {
      result.push({
        role: 'user',
        content: '-',
      })
    }
  })

  return result
}
