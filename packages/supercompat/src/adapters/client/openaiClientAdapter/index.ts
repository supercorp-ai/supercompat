import type OpenAI from 'openai'
import { models } from './models'
import { completions } from './completions'

export const openaiClientAdapter = ({
  openai,
}: {
  openai: OpenAI
}) => ({
  client: openai,
  requestHandlers: {
    '^/v1/models$': models({ openai }),
    '^/(?:v1|/?openai)/chat/completions$': completions({ openai }),
  },
})
