import type { AIProjectClient } from '@azure/ai-projects'

export const azureAiProjectClientAdapter = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}) => ({
  type: 'AZURE_AI_PROJECT',
  client: azureAiProject,
  requestHandlers: {},
})
