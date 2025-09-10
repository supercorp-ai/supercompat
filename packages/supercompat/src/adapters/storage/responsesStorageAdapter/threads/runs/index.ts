import type { OpenAI } from 'openai'
import type { RunAdapter } from '@/types'
import { get } from './get'
import { post } from './post'
import type { RequestHandler } from '@/types'

export const runs = ({
  openai,
  runAdapter,
}: {
  openai: OpenAI
  runAdapter: RunAdapter
}): { get: RequestHandler; post: RequestHandler } => ({
  get: get({ openai }),
  post: post({ openai, runAdapter }),
})
