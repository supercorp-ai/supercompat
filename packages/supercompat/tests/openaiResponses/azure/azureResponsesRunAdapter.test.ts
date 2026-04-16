/**
 * Responses API: azureResponsesRunAdapter + Azure
 * Uses Azure's native Responses API — built-in tools work natively.
 */
import { test, describe } from 'node:test'
import { responsesContracts as _all } from '../contracts'
import { withRetry } from '../contracts/lib/withRetry'
import { config } from '../contracts/lib/config'
import {
  supercompat,
  azureAiProjectClientAdapter,
  azureResponsesRunAdapter,
  prismaStorageAdapter,
} from '../../../src/openai/index'
import { AIProjectClient as AIProjectClientV2 } from '@azure/ai-projects-v2'
import { AIProjectClient as AIProjectClientV1 } from '@azure/ai-projects'
import { ClientSecretCredential } from '@azure/identity'
import { PrismaClient } from '@prisma/client'
import { createTestPrisma } from '../../lib/testPrisma'
import { post as fileUploadPost, del as fileDeleteHandler } from '../../../src/handlers/assistants/azureAgentsStorageAdapter/files/upload'
import { createVectorStore, getVectorStore, deleteVectorStore } from '../../../src/handlers/assistants/azureAgentsStorageAdapter/vectorStores'

const endpoint = process.env.AZURE_PROJECT_ENDPOINT
const tenantId = process.env.AZURE_TENANT_ID
const clientId = process.env.AZURE_CLIENT_ID
const clientSecret = process.env.AZURE_CLIENT_SECRET
if (!endpoint || !tenantId || !clientId || !clientSecret) {
  console.log('Skipping: Azure credentials required')
  process.exit(0)
}
if (!process.env.DATABASE_URL) { console.log('Skipping: DATABASE_URL required'); process.exit(0) }

// Exclusions: dual storage mismatch + computer_use
const exclude = new Set([
  'streaming: previous_response_id chaining',
  'conversations: multi-turn',
  'conversations: input items',
  'conversations: item retrieve',
  'params: max_output_tokens',
  'builtin-tools: computer use',
])
const responsesContracts = Object.fromEntries(Object.entries(_all).filter(([n]) => !exclude.has(n)))

function createClient() {
  config.model = 'gpt-4.1-mini'
  const credential = new ClientSecretCredential(tenantId!, clientId!, clientSecret!)
  // v2 for Responses API (has getOpenAIClient)
  const azureAiProjectV2 = new AIProjectClientV2(endpoint!, credential)
  // v1 for file/vector store operations (has agents.files)
  const azureAiProjectV1 = new AIProjectClientV1(endpoint!, credential)

  const basePrisma = prismaStorageAdapter({ prisma: createTestPrisma() })

  const storageWithAzureFiles = (args: any) => {
    const base = basePrisma(args)
    return {
      requestHandlers: {
        ...base.requestHandlers,
        '^/(?:v1|/?openai)/files$': { post: fileUploadPost({ azureAiProject: azureAiProjectV1 }) },
        '^/(?:v1|/?openai)/files/[^/]+$': { delete: fileDeleteHandler({ azureAiProject: azureAiProjectV1 }) },
        '^/(?:v1|/?openai)/vector_stores$': { post: createVectorStore({ azureAiProject: azureAiProjectV1 }) },
        '^/(?:v1|/?openai)/vector_stores/[^/]+$': { get: getVectorStore({ azureAiProject: azureAiProjectV1 }), delete: deleteVectorStore({ azureAiProject: azureAiProjectV1 }) },
      },
    }
  }

  return supercompat({
    clientAdapter: azureAiProjectClientAdapter({ azureAiProject: azureAiProjectV2 as any }),
    runAdapter: azureResponsesRunAdapter({ azureAiProject: azureAiProjectV2 as any }),
    storageAdapter: storageWithAzureFiles,
  })
}

describe('Responses API: azureResponsesRunAdapter + Azure', { concurrency: true, timeout: 60_000 }, () => {
  for (const [name, contract] of Object.entries(responsesContracts)) {
    const slow = name.includes('file search') || name.includes('annotation indexes')
    test(name, { concurrency: true, timeout: slow ? 180_000 : 60_000 }, () =>
      withRetry(() => contract(createClient()), { label: name }))
  }
})
