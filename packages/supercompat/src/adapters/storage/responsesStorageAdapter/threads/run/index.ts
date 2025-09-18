import type { OpenAI } from 'openai'
import type { RunAdapter, RequestHandler } from '@/types'
import { get } from './get'
// import { post } from './post'

export const run = ({
  client,
  runAdapter,
}: {
  client: OpenAI
  runAdapter: RunAdapter
}): { get: RequestHandler } => ({
  get: get({ client, runAdapter }),
  // post: post({ prisma, runAdapter }),
})
