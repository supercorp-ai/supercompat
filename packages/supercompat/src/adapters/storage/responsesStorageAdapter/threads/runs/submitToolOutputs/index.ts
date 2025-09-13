import type { OpenAI } from 'openai'
import type { RunAdapter } from '@/types'
import { post } from './post'
import type { RequestHandler } from '@/types'

export const submitToolOutputs = ({
  openai,
  openaiAssistant,
  runAdapter,
}: {
  openai: OpenAI
  openaiAssistant: OpenAI.Beta.Assistants.Assistant
  runAdapter: RunAdapter
}): { post: RequestHandler } => ({
  post: post({
    openai,
    openaiAssistant,
    // @ts-ignore-next-line
    runAdapter,
  }),
})
