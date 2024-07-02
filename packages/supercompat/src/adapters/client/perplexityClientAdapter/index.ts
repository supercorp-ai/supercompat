import type OpenAI from 'openai'
import { completions } from './completions'

export const perplexityClientAdapter = ({
  perplexity,
}: {
  perplexity: OpenAI
}) => ({
  '^/v1/chat/completions$': completions({ perplexity }),
})
