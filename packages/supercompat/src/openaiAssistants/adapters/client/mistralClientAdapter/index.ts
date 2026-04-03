import type { Mistral } from '@mistralai/mistralai'
import { models } from './models'
import { completions } from './completions'

export const mistralClientAdapter = ({
  mistral,
}: {
  mistral: Mistral
}) => ({
  client: mistral,
  requestHandlers: {
    '^/v1/models$': models({ mistral }),
    '^/v1/chat/completions$': completions({ mistral }),
  },
})
