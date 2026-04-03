import type OpenAI from 'openai'
import { get } from './get'

export const models = ({
  perplexity,
}: {
  perplexity: OpenAI
}) => ({
  get: get({ perplexity }),
})
