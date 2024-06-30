import type OpenAI from 'openai'
import { completions } from './completions'

export const openaiClientAdapter = ({
  openai,
}: {
  openai: OpenAI
}) => ({
  '^/v1/chat/completions$': completions({ openai }),
})
