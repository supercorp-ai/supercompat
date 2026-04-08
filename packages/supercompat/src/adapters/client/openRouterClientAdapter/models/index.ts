import type { OpenRouter } from '@openrouter/sdk'
import { get } from './get'

export const models = ({
  openRouter,
}: {
  openRouter: OpenRouter
}) => ({
  get: get({ openRouter }),
})
