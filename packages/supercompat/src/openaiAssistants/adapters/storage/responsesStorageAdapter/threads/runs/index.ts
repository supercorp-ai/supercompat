import type { OpenAI } from 'openai'
import { get } from './get'
import { post } from './post'
import type { RequestHandler, RunAdapterWithAssistant } from '@/types'

export const runs = ({
  client,
  runAdapter,
  createResponseItems,
}: {
  client: OpenAI
  runAdapter: RunAdapterWithAssistant
  createResponseItems: OpenAI.Responses.ResponseInputItem[]
}): { get: RequestHandler; post: RequestHandler } => ({
  get: get(),
  post: post({ client, createResponseItems, runAdapter }),
})
