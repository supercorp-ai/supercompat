import type { OpenAI } from 'openai'
import { get } from './get'
import type { RequestHandler, RunAdapterWithAssistant } from '@/types'

export const steps = ({
  client,
  runAdapter,
}: {
  client: OpenAI
  runAdapter: RunAdapterWithAssistant
}): { get: RequestHandler } => ({
  get: get({ client, runAdapter }),
})
