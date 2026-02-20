import type { OpenRouter } from '@openrouter/sdk'
import { post } from './post'

export const completions = ({
  openRouter,
  provider,
}: {
  openRouter: OpenRouter
  provider?: Record<string, unknown>
}) => ({
  post: post({ openRouter, provider }),
})
