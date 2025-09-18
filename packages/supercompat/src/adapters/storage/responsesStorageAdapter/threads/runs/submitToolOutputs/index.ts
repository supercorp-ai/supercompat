import type { OpenAI } from 'openai'
import type { RunAdapter } from '@/types'
import { post } from './post'
import type { RequestHandler } from '@/types'

export const submitToolOutputs = ({
  client,
  runAdapter,
}: {
  client: OpenAI
  runAdapter: RunAdapter
}): { post: RequestHandler } => ({
  post: post({
    client,
    runAdapter,
  }),
})
