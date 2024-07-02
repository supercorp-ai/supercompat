import type Anthropic from '@anthropic-ai/sdk'
import { post } from './post'

export const completions = ({
  anthropic,
}: {
  anthropic: Anthropic
}) => ({
  post: post({ anthropic }),
})
