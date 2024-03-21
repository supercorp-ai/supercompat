import type OpenAI from 'openai'
import type MistralClient from '@mistralai/mistralai'

export const mistralClientAdapter = ({
  mistral,
}: {
  mistral: MistralClient
}) => ({
  chat: {
    completions: {
      // @ts-ignore-next-line
      create: (...args: Parameters<OpenAI.Chat.Completions['create']>): ReturnType<OpenAI.Chat.Completions['create']> => (
        // @ts-ignore-next-line
        (args[0].stream ? mistral.chatStream(...args) : mistral.chat(...args))
      )
    },
  },
})
