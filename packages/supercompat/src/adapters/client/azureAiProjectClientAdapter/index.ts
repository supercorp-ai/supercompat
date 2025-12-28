import type { AIProjectClient } from '@azure/ai-projects'

/**
 * Client adapter for Azure AI Projects.
 *
 * Supports both Azure Agents API and Azure Responses API:
 *
 * @example Azure Agents API
 * ```typescript
 * const client = supercompat({
 *   client: azureAiProjectClientAdapter({ azureAiProject }),
 *   storage: azureAgentsStorageAdapter(),
 *   runAdapter: azureAgentsRunAdapter({ ... })
 * })
 * ```
 *
 * @example Azure Responses API
 * ```typescript
 * const client = supercompat({
 *   client: azureAiProjectClientAdapter({ azureAiProject }),
 *   storage: azureResponsesStorageAdapter(),
 *   runAdapter: responsesRunAdapter({ ... })
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
  requestHandlers: {},
})
