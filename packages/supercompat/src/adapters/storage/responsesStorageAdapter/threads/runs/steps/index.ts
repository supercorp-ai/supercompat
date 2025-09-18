import type { OpenAI } from 'openai'
import { get } from './get'
import type { RequestHandler } from '@/types'

export const steps = ({
  openai,
  openaiAssistant,
}: {
  openai: OpenAI
  openaiAssistant: OpenAI.Beta.Assistants.Assistant
}): { get: RequestHandler } => ({
  get: get({ openai, openaiAssistant }),
})
