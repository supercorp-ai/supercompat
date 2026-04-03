// Re-export everything from openaiAssistants for backward compatibility
// Users can import from 'supercompat' or 'supercompat/openaiAssistants'
export { supercompat } from './openaiAssistants/supercompat'
export { groqClientAdapter } from './openaiAssistants/adapters/client/groqClientAdapter'
export { openaiClientAdapter } from './openaiAssistants/adapters/client/openaiClientAdapter'
export { azureOpenaiClientAdapter } from './openaiAssistants/adapters/client/azureOpenaiClientAdapter'
export { azureAiProjectClientAdapter } from './openaiAssistants/adapters/client/azureAiProjectClientAdapter'
export { mistralClientAdapter } from './openaiAssistants/adapters/client/mistralClientAdapter'
export { perplexityClientAdapter } from './openaiAssistants/adapters/client/perplexityClientAdapter'
export { anthropicClientAdapter } from './openaiAssistants/adapters/client/anthropicClientAdapter'
export { togetherClientAdapter } from './openaiAssistants/adapters/client/togetherClientAdapter'
export { googleClientAdapter } from './openaiAssistants/adapters/client/googleClientAdapter'
export { humirisClientAdapter } from './openaiAssistants/adapters/client/humirisClientAdapter'
export { ollamaClientAdapter } from './openaiAssistants/adapters/client/ollamaClientAdapter'
export { openRouterClientAdapter } from './openaiAssistants/adapters/client/openRouterClientAdapter'
export { completionsRunAdapter } from './openaiAssistants/adapters/run/completionsRunAdapter'
export { prismaStorageAdapter } from './openaiAssistants/adapters/storage/prismaStorageAdapter'
export { responsesStorageAdapter } from './openaiAssistants/adapters/storage/responsesStorageAdapter'
export { azureResponsesStorageAdapter } from './openaiAssistants/adapters/storage/azureResponsesStorageAdapter'
export { azureAgentsStorageAdapter } from './openaiAssistants/adapters/storage/azureAgentsStorageAdapter'
export { responsesRunAdapter } from './openaiAssistants/adapters/run/responsesRunAdapter'
export { azureAgentsRunAdapter } from './openaiAssistants/adapters/run/azureAgentsRunAdapter'
export { perplexityAgentRunAdapter } from './openaiAssistants/adapters/run/perplexityAgentRunAdapter'
export {
  getComputerCallActions,
  isOpenaiComputerUseModel,
  serializeCompatComputerCall,
  serializeComputerUseTool,
} from './openaiAssistants/lib/openaiComputerUse'
