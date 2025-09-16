import type { OpenAI } from 'openai'
import { get } from './get'
import { post } from './post'
import type { RequestHandler } from '@/types'

export const assistants = ({
  openai,
  openaiAssistant,
}: {
  openai: OpenAI
  openaiAssistant: OpenAI.Beta.Assistants.Assistant
}): { post: RequestHandler } => ({
  get: get({ openaiAssistant }),
  post: post({ openai }),
})
