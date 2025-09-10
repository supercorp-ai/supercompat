import type { OpenAI } from 'openai'
import { post } from './post'
import type { RequestHandler } from '@/types'

export const threads = ({
  openai,
}: {
  openai: OpenAI
}): { post: RequestHandler } => ({
  post: post({ openai }),
})
