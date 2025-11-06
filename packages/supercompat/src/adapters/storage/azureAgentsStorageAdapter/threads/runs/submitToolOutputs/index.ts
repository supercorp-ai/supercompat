import type { AIProjectClient } from '@azure/ai-projects'
import { post } from './post'
import type { RequestHandler, RunAdapterWithAssistant } from '@/types'

export const submitToolOutputs = ({
  azureAiProject,
  runAdapter,
}: {
  azureAiProject: AIProjectClient
  runAdapter: RunAdapterWithAssistant
}): { post: RequestHandler } => ({
  post: post({ azureAiProject, runAdapter }),
})
