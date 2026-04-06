import type { OpenAI } from 'openai'
import { post } from './post'
import { get } from './get'
import type { RequestHandler, RunAdapterWithAssistant } from '@/types'

export const messages = ({
  client,
  runAdapter,
  createResponseItems,
  deferItemCreationUntilRun = false,
  addAnnotations = false,
}: {
  client: OpenAI
  runAdapter: RunAdapterWithAssistant
  createResponseItems: OpenAI.Responses.ResponseInputItem[]
  deferItemCreationUntilRun?: boolean
  addAnnotations?: boolean
}): { post: RequestHandler; get: RequestHandler } => ({
  post: post({ client, runAdapter, createResponseItems, deferItemCreationUntilRun, addAnnotations }),
  get: get({ client, runAdapter }),
})
