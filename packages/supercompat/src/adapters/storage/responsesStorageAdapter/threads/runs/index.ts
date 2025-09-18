import type { OpenAI } from 'openai'
import { get } from './get'
import { post } from './post'
import type { RequestHandler, RunAdapter } from '@/types'

export const runs = ({
  client,
  runAdapter,
  createResponseItems,
}: {
  client: OpenAI
  runAdapter: RunAdapter
  createResponseItems: OpenAI.Responses.ResponseItem[]
}): { get: RequestHandler; post: RequestHandler } => ({
  get: get(),
  post: post({ client, createResponseItems, runAdapter }),
})
