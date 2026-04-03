import type { OpenAI } from 'openai'
import { post } from './post'
import { get } from './get'
import type { RequestHandler, RunAdapterWithAssistant } from '@/types'

export const messages = ({
  client,
  runAdapter,
  createResponseItems,
  addAnnotations = false,
}: {
  client: OpenAI
  runAdapter: RunAdapterWithAssistant
  createResponseItems: OpenAI.Responses.ResponseInputItem[]
  addAnnotations?: boolean
}): { post: RequestHandler; get: RequestHandler } => ({
  post: post({ runAdapter, createResponseItems, addAnnotations }),
  get: get({ client, runAdapter }),
})
