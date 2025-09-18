import type { OpenAI } from 'openai'
import { post } from './post'
import type { RequestHandler } from '@/types'

export const threads = ({
  client,
}: {
  client: OpenAI
}): { post: RequestHandler } => ({
  post: post({ client }),
})
