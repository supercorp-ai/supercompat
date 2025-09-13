import type { OpenAI } from 'openai'
import { get } from './get'
import type { RequestHandler } from '@/types'

export const steps = ({
  openai,
}: {
  openai: OpenAI
}): { get: RequestHandler } => ({
  get: get({ openai }),
})
