import type { AIProjectsClient } from '@azure/ai-projects'
import { get } from './get'

export const steps = ({
  azureAiProjectsClient,
}: {
  azureAiProjectsClient: AIProjectsClient
}) => ({
  get: get({ azureAiProjectsClient }),
})
