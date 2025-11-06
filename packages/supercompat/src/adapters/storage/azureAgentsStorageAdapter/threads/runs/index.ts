import type { AIProjectClient } from '@azure/ai-projects'
import { get } from './get'
import { post } from './post'
import type { RequestHandler, RunAdapterWithAssistant } from '@/types'

export const runs = ({
  azureAiProject,
  runAdapter,
  azureAgentId,
}: {
  azureAiProject: AIProjectClient
  runAdapter: RunAdapterWithAssistant
  azureAgentId: string
}): { get: RequestHandler; post: RequestHandler } => ({
  get: get(),
  post: post({ azureAiProject, runAdapter, azureAgentId }),
})
