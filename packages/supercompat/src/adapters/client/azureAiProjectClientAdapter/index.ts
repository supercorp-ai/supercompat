import type { AIProjectClient } from '@azure/ai-projects'
import { models } from './models'

/**
 * Client adapter for Azure AI Projects.
 *
 * Supports both Azure Agents API and Azure Responses API:
 *
 * @example Azure Agents API
 * ```typescript
 * const client = supercompat({
 *   clientAdapter: azureAiProjectClientAdapter({ azureAiProject }),
 *   storageAdapter: azureAgentsStorageAdapter(),
 *   runAdapter: azureAgentsRunAdapter({ ... })
 * })
 * ```
 *
 * @example Azure Responses API
 * ```typescript
 * const client = supercompat({
 *   clientAdapter: azureAiProjectClientAdapter({ azureAiProject }),
 *   storageAdapter: azureResponsesStorageAdapter(),
 *   runAdapter: azureResponsesRunAdapter({ ... })
 * })
 * ```
 */
export const azureAiProjectClientAdapter = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}) => ({
  type: 'AZURE_AI_PROJECT',
  client: azureAiProject,
  requestHandlers: {
    '^/v1/models$': models({ azureAiProject }),
  },
})
