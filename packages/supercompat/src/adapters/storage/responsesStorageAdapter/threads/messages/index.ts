import type { OpenAI } from 'openai'
import { post } from './post'
import { get } from './get'
import type { RequestHandler } from '@/types'

export const messages = ({
  openai,
  openaiAssistant,
  createResponseItems,
}: {
  openai: OpenAI
  openaiAssistant: OpenAI.Beta.Assistants.Assistant
  createResponseItems: OpenAI.Responses.ResponseItem[]
}): { post: RequestHandler; get: RequestHandler } => ({
  post: post({ openai, openaiAssistant, createResponseItems }),
  get: get({ openai, openaiAssistant }),
})
