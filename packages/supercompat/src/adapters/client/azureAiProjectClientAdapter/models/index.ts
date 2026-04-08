import type { AIProjectClient } from '@azure/ai-projects'
import { get } from './get'

export const models = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}) => ({
  get: get({ azureAiProject }),
})
