import type { AIProjectClient } from '@azure/ai-projects'
import { get } from './get'
import type { RequestHandler, RunAdapterWithAssistant } from '@/types'

export const steps = ({
  azureAiProject,
  runAdapter,
}: {
  azureAiProject: AIProjectClient
  runAdapter: RunAdapterWithAssistant
}): { get: RequestHandler } => ({
  get: get({ azureAiProject, runAdapter }),
})
