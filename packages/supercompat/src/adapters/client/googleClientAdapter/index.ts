import type OpenAI from 'openai'
import { models } from './models'
import { completions } from './completions'

export const googleClientAdapter = ({
  google,
}: {
  google: OpenAI
}) => ({
  client: google,
  requestHandlers: {
    '^/v1/models$': models({ google }),
    '^/(?:v1|/?openai)/chat/completions$': completions({ google }),
  },
})
