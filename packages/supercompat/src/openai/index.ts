// Unified OpenAI output — supports both Assistants API and Responses API
export { supercompat } from '../supercompat'

// Client adapters
export { groqClientAdapter } from '../adapters/client/groqClientAdapter'
export { openaiClientAdapter } from '../adapters/client/openaiClientAdapter'
export { azureOpenaiClientAdapter } from '../adapters/client/azureOpenaiClientAdapter'
export { azureAiProjectClientAdapter } from '../adapters/client/azureAiProjectClientAdapter'
export { mistralClientAdapter } from '../adapters/client/mistralClientAdapter'
export { perplexityClientAdapter } from '../adapters/client/perplexityClientAdapter'
export { anthropicClientAdapter } from '../adapters/client/anthropicClientAdapter'
export { togetherClientAdapter } from '../adapters/client/togetherClientAdapter'
export { googleClientAdapter } from '../adapters/client/googleClientAdapter'
export { humirisClientAdapter } from '../adapters/client/humirisClientAdapter'
export { ollamaClientAdapter } from '../adapters/client/ollamaClientAdapter'
export { openRouterClientAdapter } from '../adapters/client/openRouterClientAdapter'

// Run adapters
export { completionsRunAdapter } from '../adapters/run/completionsRunAdapter'
export { azureAgentsRunAdapter } from '../adapters/run/azureAgentsRunAdapter'
export { perplexityAgentRunAdapter } from '../adapters/run/perplexityAgentRunAdapter'
export { openaiResponsesRunAdapter } from '../adapters/run/openaiResponsesRunAdapter'
export { azureResponsesRunAdapter } from '../adapters/run/azureResponsesRunAdapter'
export { anthropicRunAdapter } from '../adapters/run/anthropicRunAdapter'
export { azureAgentsResponsesRunAdapter } from '../adapters/run/azureAgentsResponsesRunAdapter'
export { geminiRunAdapter } from '../adapters/run/geminiRunAdapter'

// Storage adapters
export { prismaStorageAdapter } from './prismaStorageAdapter'
export { memoryStorageAdapter } from '../handlers/assistants/memoryStorageAdapter'
export { responsesStorageAdapter } from '../handlers/assistants/responsesStorageAdapter'
export { azureAgentsStorageAdapter } from '../handlers/assistants/azureAgentsStorageAdapter'
export { azureResponsesStorageAdapter } from '../handlers/assistants/azureResponsesStorageAdapter'

// Utilities
export {
  getComputerCallActions,
  isOpenaiComputerUseModel,
  serializeCompatComputerCall,
  serializeComputerUseTool,
} from '../lib/openaiComputerUse'
