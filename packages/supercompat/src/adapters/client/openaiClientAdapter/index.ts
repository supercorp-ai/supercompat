import type OpenAI from 'openai'
import { completions } from './completions'

export const openaiClientAdapter = ({
  openai,
}: {
  openai: OpenAI
}) => ({
  client: openai,
  requestHandlers: {
    '^/(?:v1|/?openai)/chat/completions$': completions({ openai }),
  },
})
