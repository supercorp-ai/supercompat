import type OpenAI from 'openai'
import { post } from './post'

export const completions = ({
  perplexity,
}: {
  perplexity: OpenAI
}) => ({
  post: post({ perplexity }),
})
