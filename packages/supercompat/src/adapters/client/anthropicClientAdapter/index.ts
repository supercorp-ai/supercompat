import type Anthropic from '@anthropic-ai/sdk'
import { completions } from './completions'

export const anthropicClientAdapter = ({
  anthropic,
}: {
  anthropic: Anthropic
}) => ({
  client: anthropic,
  routeHandlers: {
    '^/v1/chat/completions$': completions({ anthropic }),
  },
})
