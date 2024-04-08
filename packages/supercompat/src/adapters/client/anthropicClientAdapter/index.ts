import type OpenAI from 'openai'
import type Anthropic from '@anthropic-ai/sdk'

export const anthropicClientAdapter = ({
  anthropic,
}: {
  anthropic: Anthropic
}) => ({
  chat: {
    completions: {
      create: (...args: Parameters<OpenAI.Chat.Completions['create']>): ReturnType<OpenAI.Chat.Completions['create']> => {
        const [firstArg, secondArg, ...restArgs] = args

        const messages = firstArg.messages
        console.dir({ messages }, { depth: null })

        if (firstArg.messages[0].role != 'user') {
          messages.unshift({
            role: 'user',
            content: '-',
          })
        }

        const resultFirstArg = {
          ...firstArg,
          messages,
        }

        const resultSecondArg = {
          ...secondArg,
          headers: {
            ...secondArg?.headers ?? {},
            'anthropic-beta': 'tools-2024-04-04',
          },
        }

        if (args[0].stream) {
          // @ts-ignore-next-line
          return anthropic.messages.stream(resultFirstArg, resultSecondArg, ...restArgs)
        } else {
          // @ts-ignore-next-line
          return anthropic.messages.create(resultFirstArg, resultSecondArg, ...restArgs)
        }
      }
    },
  },
})
