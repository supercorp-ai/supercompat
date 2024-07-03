import type OpenAI from 'openai'
import { completions } from './completions'

export const perplexityClientAdapter = ({
  perplexity,
}: {
  perplexity: OpenAI
}) => ({
  client: perplexity,
  requestHandlers: {
    '^/v1/chat/completions$': completions({ perplexity }),
  },
})
