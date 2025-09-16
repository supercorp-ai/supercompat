import type { OpenAI } from 'openai'
import { post } from './post'
import { get } from './get'
import type { RequestHandler } from '@/types'

export const messages = ({
  openai,
  openaiAssistant,
}: {
  openai: OpenAI
  openaiAssistant: OpenAI.Beta.Assistants.Assistant
}): { post: RequestHandler; get: RequestHandler } => ({
  post: post({ openai, openaiAssistant }),
  get: get({ openai, openaiAssistant }),
})
