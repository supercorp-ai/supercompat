import type OpenAI from 'openai'
import { models } from './models'
import { completions } from './completions'

export const togetherClientAdapter = ({
  together,
}: {
  together: OpenAI
}) => ({
  client: together,
  requestHandlers: {
    '^/v1/models$': models({ together }),
    '^/(?:v1|/?openai)/chat/completions$': completions({ together }),
  },
})
