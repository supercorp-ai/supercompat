import type { OpenAI } from 'openai'
import { post } from './post'
import { get } from './get'
import type { RequestHandler } from '@/types'

export const messages = ({
  openai,
}: {
  openai: OpenAI
}): { post: RequestHandler; get: RequestHandler } => ({
  post: post({ openai }),
  get: get({ openai }),
})
