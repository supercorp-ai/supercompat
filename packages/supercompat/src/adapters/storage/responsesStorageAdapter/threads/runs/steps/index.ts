import type { OpenAI } from 'openai'
import { get } from './get'
import type { RequestHandler, RunAdapter } from '@/types'

export const steps = ({
  client,
  runAdapter,
}: {
  client: OpenAI
  runAdapter: RunAdapter
}): { get: RequestHandler } => ({
  get: get({ client, runAdapter }),
})
