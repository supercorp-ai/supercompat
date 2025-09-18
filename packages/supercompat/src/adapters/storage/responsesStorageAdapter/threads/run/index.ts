import type { OpenAI } from 'openai'
import type { RunAdapter } from '@/types'
import { get } from './get'
// import { post } from './post'
import type { RequestHandler } from '@/types'

export const run = ({
  openai,
  openaiAssistant,
  runAdapter,
}: {
  openai: OpenAI
  openaiAssistant: OpenAI.Beta.Assistants.Assistant
  runAdapter: RunAdapter
}): { get: RequestHandler } => ({
  get: get({ openai, openaiAssistant }),
  // post: post({ prisma, runAdapter }),
})
