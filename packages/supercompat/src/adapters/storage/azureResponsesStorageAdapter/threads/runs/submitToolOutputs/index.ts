import type { OpenAI } from 'openai'
import type { RequestHandler, RunAdapterWithAssistant } from '@/types'
import { post } from './post'

export const submitToolOutputs = ({
  client,
  runAdapter,
}: {
  client: OpenAI
  runAdapter: RunAdapterWithAssistant
}): { post: RequestHandler } => ({
  post: post({
    client,
    runAdapter,
  }),
})
