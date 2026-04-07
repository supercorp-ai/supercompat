// Unified OpenAI output — supports both Assistants API and Responses API
export { supercompat as createClient } from '../supercompat'
export { supercompat } from '../supercompat'

// Client adapters
export { groqClientAdapter } from '../openaiAssistants/adapters/client/groqClientAdapter'
export { openaiClientAdapter } from '../openaiAssistants/adapters/client/openaiClientAdapter'
export { azureOpenaiClientAdapter } from '../openaiAssistants/adapters/client/azureOpenaiClientAdapter'
export { azureAiProjectClientAdapter } from '../openaiAssistants/adapters/client/azureAiProjectClientAdapter'
export { mistralClientAdapter } from '../openaiAssistants/adapters/client/mistralClientAdapter'
export { perplexityClientAdapter } from '../openaiAssistants/adapters/client/perplexityClientAdapter'
export { anthropicClientAdapter } from '../openaiAssistants/adapters/client/anthropicClientAdapter'
export { togetherClientAdapter } from '../openaiAssistants/adapters/client/togetherClientAdapter'
export { googleClientAdapter } from '../openaiAssistants/adapters/client/googleClientAdapter'
export { humirisClientAdapter } from '../openaiAssistants/adapters/client/humirisClientAdapter'
export { ollamaClientAdapter } from '../openaiAssistants/adapters/client/ollamaClientAdapter'
export { openRouterClientAdapter } from '../openaiAssistants/adapters/client/openRouterClientAdapter'

// Run adapters
export { completionsRunAdapter } from '../openaiAssistants/adapters/run/completionsRunAdapter'
export { responsesRunAdapter } from '../openaiAssistants/adapters/run/responsesRunAdapter'
export { azureAgentsRunAdapter } from '../openaiAssistants/adapters/run/azureAgentsRunAdapter'
export { perplexityAgentRunAdapter } from '../openaiAssistants/adapters/run/perplexityAgentRunAdapter'
export { openaiResponsesRunAdapter } from '../openaiResponses/adapters/run/openaiResponsesRunAdapter'
export { azureResponsesRunAdapter } from '../openaiResponses/adapters/run/azureResponsesRunAdapter'
export { anthropicRunAdapter } from '../openaiResponses/adapters/run/anthropicRunAdapter'
export { azureAgentsResponsesRunAdapter } from '../openaiResponses/adapters/run/azureAgentsRunAdapter'
export { geminiRunAdapter } from '../openaiResponses/adapters/run/geminiRunAdapter'

// Storage adapters
export { prismaStorageAdapter } from './prismaStorageAdapter'
export { responsesStorageAdapter } from '../openaiAssistants/adapters/storage/responsesStorageAdapter'
export { azureAgentsStorageAdapter } from '../openaiAssistants/adapters/storage/azureAgentsStorageAdapter'
export { azureResponsesStorageAdapter } from '../openaiAssistants/adapters/storage/azureResponsesStorageAdapter'

// Utilities
export {
  getComputerCallActions,
  isOpenaiComputerUseModel,
  serializeCompatComputerCall,
  serializeComputerUseTool,
} from '../lib/openaiComputerUse'
