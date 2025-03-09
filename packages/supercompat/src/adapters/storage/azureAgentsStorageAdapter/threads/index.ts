import type { AIProjectsClient } from '@azure/ai-projects'
import { post } from './post'

export const threads = ({
  azureAiProjectsClient,
}: {
  azureAiProjectsClient: AIProjectsClient
}) => ({
  post: post({ azureAiProjectsClient }),
})
