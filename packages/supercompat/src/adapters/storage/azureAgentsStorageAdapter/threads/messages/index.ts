import type { AIProjectClient } from '@azure/ai-projects'
import { post } from './post'
import { get } from './get'
import type { RequestHandler, RunAdapterWithAssistant } from '@/types'

export const messages = ({
  azureAiProject,
  runAdapter,
}: {
  azureAiProject: AIProjectClient
  runAdapter: RunAdapterWithAssistant
}): { post: RequestHandler; get: RequestHandler } => ({
  post: post({ azureAiProject, runAdapter }),
  get: get({ azureAiProject, runAdapter }),
})
