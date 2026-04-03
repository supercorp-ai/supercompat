import type Anthropic from '@anthropic-ai/sdk'
import { get } from './get'

export const models = ({
  anthropic,
}: {
  anthropic: Anthropic
}) => ({
  get: get({ anthropic }),
})
