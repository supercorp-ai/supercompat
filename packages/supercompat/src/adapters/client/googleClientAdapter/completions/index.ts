import type OpenAI from 'openai'
import { post } from './post'

export const completions = ({
  google,
}: {
  google: OpenAI
}) => ({
  post: post({ google }),
})
