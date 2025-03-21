import type { AIProjectsClient } from '@azure/ai-projects'
import type { RunAdapter } from '@/types'
import { post } from './post'

export const submitToolOutputs = ({
  azureAiProjectsClient,
  runAdapter,
}: {
  azureAiProjectsClient: AIProjectsClient
  runAdapter: RunAdapter
}) => ({
  post: post({
    azureAiProjectsClient,
    // @ts-ignore-next-line
    runAdapter,
  }),
})
