import type OpenAI from 'openai'
import { post } from './post'

export const completions = ({
  together,
}: {
  together: OpenAI
}) => ({
  post: post({ together }),
})
