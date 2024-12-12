import type OpenAI from 'openai'
import { models } from './models'
import { completions } from './completions'

export const ollamaClientAdapter = ({
  ollama,
}: {
  ollama: OpenAI
}) => ({
  client: ollama,
  requestHandlers: {
    '^/v1/models$': models({ ollama }),
    '^/(?:v1|/?openai)/chat/completions$': completions({ ollama }),
  },
})
