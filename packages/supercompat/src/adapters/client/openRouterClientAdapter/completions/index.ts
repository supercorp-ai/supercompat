import type { OpenRouter } from '@openrouter/sdk'
import { post } from './post'

export const completions = ({
  openRouter,
}: {
  openRouter: OpenRouter
}) => ({
  post: post({ openRouter }),
})
