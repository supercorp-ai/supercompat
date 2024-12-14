import type OpenAI from 'openai'
import { post } from './post'

export const completions = ({
  humiris,
}: {
  humiris: OpenAI
}) => ({
  post: post({ humiris }),
})
