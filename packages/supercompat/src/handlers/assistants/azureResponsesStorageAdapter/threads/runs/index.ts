import type { OpenAI } from 'openai'
import type { RequestHandler, RunAdapterWithAssistant } from '@/types'
import { get } from '@/handlers/assistants/responsesStorageAdapter/threads/runs/get'
import { post } from './post'

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
