import type OpenAI from 'openai'
import { models } from './models'
import { completions } from './completions'

export const perplexityClientAdapter = ({
  perplexity,
}: {
  perplexity: OpenAI
}) => ({
  client: perplexity,
  requestHandlers: {
    '^/v1/models$': models({ perplexity }),
    '^/v1/chat/completions$': completions({ perplexity }),
  },
})
