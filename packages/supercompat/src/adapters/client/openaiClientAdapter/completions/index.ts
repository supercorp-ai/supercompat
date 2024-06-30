import type OpenAI from 'openai'
import { post } from './post'

export const completions = ({
  openai,
}: {
  openai: OpenAI
}) => ({
  post: post({ openai }),
})
