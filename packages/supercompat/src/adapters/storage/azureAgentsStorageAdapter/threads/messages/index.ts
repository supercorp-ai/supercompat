import type { AIProjectsClient } from '@azure/ai-projects'
import { post } from './post'
import { get } from './get'

export const messages = ({
  azureAiProjectsClient,
}: {
  azureAiProjectsClient: AIProjectsClient
}) => ({
  post: post({ azureAiProjectsClient }),
  get: get({ azureAiProjectsClient }),
})
