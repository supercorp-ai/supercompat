import type Mistral from '@mistralai/mistralai'
import { completions } from './completions'

export const mistralClientAdapter = ({
  mistral,
}: {
  mistral: Mistral
}) => ({
  client: mistral,
  routeHandlers: {
    '^/v1/chat/completions$': completions({ mistral }),
  },
})
