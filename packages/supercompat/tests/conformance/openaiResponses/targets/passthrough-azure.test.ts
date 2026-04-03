/**
 * Responses API: responsesPassthroughRunAdapter + Azure Responses
 * Uses Azure's native Responses API — built-in tools work natively.
 */
import { test, describe } from 'node:test'
import { responsesContracts as _all } from '../contracts'
import { config } from '../lib/config'
import {
  supercompat,
  azureAiProjectClientAdapter,
  responsesPassthroughRunAdapter,
  prismaStorageAdapter,
} from '../../../../src/openaiResponses/index'
import { AIProjectClient } from '@azure/ai-projects-v2'
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

// Same exclusions as OpenAI passthrough + file_search (needs vector stores on Azure)
const exclude = new Set([
  'streaming: previous_response_id chaining',
  'conversations: multi-turn',
  'conversations: input items',
  'conversations: item retrieve',
  'params: max_output_tokens',
  'builtin-tools: file search',
  'builtin-tools: computer use',
])
const responsesContracts = Object.fromEntries(Object.entries(_all).filter(([n]) => !exclude.has(n)))

function createClient() {
  config.model = 'gpt-4.1-mini'
  const credential = new ClientSecretCredential(tenantId!, clientId!, clientSecret!)
  const azureAiProject = new AIProjectClient(endpoint!, credential)

  return supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: responsesPassthroughRunAdapter({
      getClient: async () => {
        return await azureAiProject.getOpenAIClient()
      },
    }),
    storage: prismaStorageAdapter({ prisma: new PrismaClient() }),
  })
}

describe('Responses API: passthrough + Azure', { timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(responsesContracts)) {
    test(name, { timeout: 120_000 }, () => contract(createClient()))
  }
})
