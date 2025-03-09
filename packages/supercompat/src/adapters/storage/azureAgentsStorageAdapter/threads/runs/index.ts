import type { AIProjectsClient } from '@azure/ai-projects'
import type { RunAdapter } from '@/types'
import { get } from './get'
import { post } from './post'

export const runs = ({
  azureAiProjectsClient,
  runAdapter,
}: {
  azureAiProjectsClient: AIProjectsClient
  runAdapter: RunAdapter
}) => ({
  get: get({ azureAiProjectsClient }),
  post: post({
    azureAiProjectsClient,
    // @ts-expect-error: partob is hard to match
    runAdapter,
  }),
})
