import type { OpenAI } from 'openai'
import { post } from './post'
import type { RequestHandler } from '@/types'

export const threads = ({
  client,
  addAnnotations = false,
}: {
  client: OpenAI
  addAnnotations?: boolean
}): { post: RequestHandler } => ({
  post: post({ client, addAnnotations }),
})
