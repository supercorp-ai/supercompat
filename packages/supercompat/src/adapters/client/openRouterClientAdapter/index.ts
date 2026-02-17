import type OpenAI from 'openai'
import { models } from './models'
import { completions } from './completions'

export const openRouterClientAdapter = ({
  openRouter,
}: {
  openRouter: OpenAI
}) => ({
  client: openRouter,
  requestHandlers: {
    '^/v1/models$': models({ openRouter }),
    '^/(?:v1|/?openai)/chat/completions$': completions({ openRouter }),
  },
})
