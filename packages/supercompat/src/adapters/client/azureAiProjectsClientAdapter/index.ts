import type { AIProjectsClient } from '@azure/ai-projects'
// import { completions } from '@/adapters/client/openaiClientAdapter/completions'

export const azureAiProjectsClientAdapter = ({
  azureAiProjectsClient,
}: {
  azureAiProjectsClient: AIProjectsClient
}) => ({
  type: 'AZURE_AI_PROJECTS',
  client: azureAiProjectsClient,
  requestHandlers: {
    // '^/(?:v1|/?openai)/chat/completions$': completions({
    //   azureAiProjectsClient,
    // }),
  },
})
