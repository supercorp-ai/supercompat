import type OpenAI from 'openai'
import { models } from './models'
import { completions } from './completions'

export const humirisClientAdapter = ({
  humiris,
}: {
  humiris: OpenAI
}) => ({
  client: humiris,
  requestHandlers: {
    '^/v1/models$': models({ humiris }),
    '^/(?:v1|/?openai)/chat/completions$': completions({ humiris }),
  },
})
