/**
 * Responses API: azureAgentsResponsesRunAdapter + Azure AI Project
 * Uses Azure Agents API natively — file_search and code_interpreter work.
 */
import { test, describe } from 'node:test'
import { responsesContracts as _all } from '../contracts'
import { config } from '../contracts/lib/config'
import {
  supercompat,
  azureAiProjectClientAdapter,
  azureAgentsResponsesRunAdapter,
  prismaStorageAdapter,
} from '../../../src/openai/index'
import { AIProjectClient } from '@azure/ai-projects'
import { ClientSecretCredential } from '@azure/identity'
import { PrismaClient } from '@prisma/client'

const endpoint = process.env.AZURE_PROJECT_ENDPOINT
const tenantId = process.env.AZURE_TENANT_ID
const clientId = process.env.AZURE_CLIENT_ID
const clientSecret = process.env.AZURE_CLIENT_SECRET
if (!endpoint || !tenantId || !clientId || !clientSecret) {
  console.log('Skipping: Azure credentials required')
  process.exit(0)
}
if (!process.env.DATABASE_URL) { console.log('Skipping: DATABASE_URL required'); process.exit(0) }

// Exclude: conversation-dependent (dual storage), computer_use, web_search (not supported by Azure Agents)
const exclude = new Set([
  'streaming: previous_response_id chaining',
  'conversations: multi-turn',
  'conversations: input items',
  'conversations: item retrieve',
  'params: max_output_tokens',
  'builtin-tools: web search',
  'builtin-tools: computer use',
  'params: structured output',
])
const responsesContracts = Object.fromEntries(Object.entries(_all).filter(([n]) => !exclude.has(n)))

import { post as fileUploadPost, del as fileDeleteHandler } from '../../../src/handlers/assistants/azureAgentsStorageAdapter/files/upload'
import { createVectorStore, getVectorStore, deleteVectorStore } from '../../../src/handlers/assistants/azureAgentsStorageAdapter/vectorStores'

function createClient() {
  config.model = 'gpt-4.1-mini'
  const credential = new ClientSecretCredential(tenantId!, clientId!, clientSecret!)
  const azureAiProject = new AIProjectClient(endpoint!, credential)

  // Use prismaStorageAdapter for Responses handlers, plus Azure file/vectorStore handlers
  const basePrisma = prismaStorageAdapter({ prisma: new PrismaClient() })

  const storageWithAzureFiles = (args: any) => {
    const base = basePrisma(args)
    return {
      requestHandlers: {
        ...base.requestHandlers,
        '^/(?:v1|/?openai)/files$': { post: fileUploadPost({ azureAiProject }) },
        '^/(?:v1|/?openai)/files/[^/]+$': { delete: fileDeleteHandler({ azureAiProject }) },
        '^/(?:v1|/?openai)/vector_stores$': { post: createVectorStore({ azureAiProject }) },
        '^/(?:v1|/?openai)/vector_stores/[^/]+$': { get: getVectorStore({ azureAiProject }), delete: deleteVectorStore({ azureAiProject }) },
      },
    }
  }

  return supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: azureAgentsResponsesRunAdapter({ azureAiProject }),
    storage: storageWithAzureFiles,
  })
}

describe('Responses API: Azure Agents native', { timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(responsesContracts)) {
    test(name, { timeout: 120_000 }, () => contract(createClient()))
  }
})
