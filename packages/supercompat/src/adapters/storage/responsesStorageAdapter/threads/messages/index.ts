import type { OpenAI } from 'openai'
import { post } from './post'
import { get } from './get'
import type { RequestHandler, RunAdapterWithAssistant } from '@/types'

export const messages = ({
  client,
  runAdapter,
  createResponseItems,
}: {
  client: OpenAI
  runAdapter: RunAdapterWithAssistant
  createResponseItems: OpenAI.Responses.ResponseInputItem[]
}): { post: RequestHandler; get: RequestHandler } => ({
  post: post({ runAdapter, createResponseItems }),
  get: get({ client, runAdapter }),
})
