import type { OpenAI } from 'openai'
import type { RunAdapter } from '@/types'
import { get } from './get'
import { post } from './post'
import type { RequestHandler } from '@/types'

export const runs = ({
  openai,
  openaiAssistant,
  runAdapter,
  createResponseItems,
}: {
  openai: OpenAI
  openaiAssistant: OpenAI.Beta.Assistants.Assistant
  runAdapter: RunAdapter
  createResponseItems: OpenAI.Responses.ResponseItem[]
}): { get: RequestHandler; post: RequestHandler } => ({
  get: get({ openai }),
  post: post({ openai, openaiAssistant, createResponseItems, runAdapter }),
})
