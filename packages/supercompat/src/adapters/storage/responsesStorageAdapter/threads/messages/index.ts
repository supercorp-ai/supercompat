import type { OpenAI } from 'openai'
import { post } from './post'
import { get } from './get'
import type { RequestHandler, RunAdapter } from '@/types'

export const messages = ({
  client,
  runAdapter,
  createResponseItems,
}: {
  client: OpenAI
  runAdapter: RunAdapter
  createResponseItems: OpenAI.Responses.ResponseItem[]
}): { post: RequestHandler; get: RequestHandler } => ({
  post: post({ runAdapter, createResponseItems }),
  get: get({ client, runAdapter }),
})
