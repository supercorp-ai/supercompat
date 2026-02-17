import type OpenAI from 'openai'
import { post } from './post'

export const completions = ({
  openRouter,
}: {
  openRouter: OpenAI
}) => ({
  post: post({ openRouter }),
})
