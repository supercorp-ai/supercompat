import type { OpenAI } from 'openai'
import type { RequestHandler, RunAdapterWithAssistant } from '@/types'
import { get } from './get'
// import { post } from './post'

export const run = ({
  client,
  runAdapter,
}: {
  client: OpenAI
  runAdapter: RunAdapterWithAssistant
}): { get: RequestHandler } => ({
  get: get({ client, runAdapter }),
  // post: post({ prisma, runAdapter }),
})
