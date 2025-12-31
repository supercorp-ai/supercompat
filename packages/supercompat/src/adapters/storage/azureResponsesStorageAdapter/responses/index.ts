import type OpenAI from 'openai'
import type { RequestHandler } from '@/types'
import { get } from './get'

export const responses = ({
  client,
}: {
  client: OpenAI
}): { get: RequestHandler } => ({
  get: get({ client }),
})
