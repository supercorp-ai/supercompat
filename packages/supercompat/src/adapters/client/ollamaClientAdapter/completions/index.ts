import type OpenAI from 'openai'
import { post } from './post'

export const completions = ({
  ollama,
}: {
  ollama: OpenAI
}) => ({
  post: post({ ollama }),
})
