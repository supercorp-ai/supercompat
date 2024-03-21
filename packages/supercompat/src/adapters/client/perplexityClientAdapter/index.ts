import type OpenAI from 'openai'

const agentSideRoles = ['assistant', 'system']

export const perplexityClientAdapter = ({
  perplexity,
}: {
  perplexity: OpenAI
}) => ({
  chat: {
    completions: {
      create: (...args: Parameters<OpenAI.Chat.Completions['create']>): ReturnType<OpenAI.Chat.Completions['create']> => {
        const [firstArg, ...restArgs] = args

        const messages = [] as OpenAI.Chat.ChatCompletionMessageParam[]

        firstArg.messages.forEach((message: OpenAI.Chat.ChatCompletionMessageParam, index: number) => {
          messages.push(message)

          const nextMessage = firstArg.messages[index + 1]
          if (!nextMessage) return

          if (message.role === 'user' && nextMessage.role === 'user') {
            messages.push({
              role: 'assistant',
              content: '',
            })
          } else if (agentSideRoles.includes(message.role) && agentSideRoles.includes(nextMessage.role)) {
            messages.push({
              role: 'user',
              content: '',
            })
          }
        })

        return perplexity.chat.completions.create({
          ...firstArg,
          messages,
        }, ...restArgs)
      },
    },
  },
})
