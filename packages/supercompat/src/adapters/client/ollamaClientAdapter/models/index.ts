import type OpenAI from 'openai'
import { get } from './get'

export const models = ({
  ollama,
}: {
  ollama: OpenAI
}) => ({
  get: get({ ollama }),
})
