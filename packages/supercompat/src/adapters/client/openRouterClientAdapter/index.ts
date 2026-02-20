import type { OpenRouter } from '@openrouter/sdk'
import { models } from './models'
import { completions } from './completions'

export const openRouterClientAdapter = ({
  openRouter,
  provider,
}: {
  openRouter: OpenRouter
  provider?: Record<string, unknown>
}) => ({
  client: openRouter,
  requestHandlers: {
    '^/v1/models$': models({ openRouter }),
    '^/(?:v1|/?openai)/chat/completions$': completions({ openRouter, provider }),
  },
})
