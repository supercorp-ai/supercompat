import type { AIProjectClient } from '@azure/ai-projects'
import { post } from './post'
import type { RequestHandler } from '@/types'

export const threads = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}): { post: RequestHandler } => ({
  post: post({ azureAiProject }),
})
