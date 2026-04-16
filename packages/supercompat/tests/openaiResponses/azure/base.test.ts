import { test, describe } from 'node:test'
import { AzureOpenAI } from 'openai'
import { responsesContracts as _allContracts } from '../contracts'

const exclude = new Set(['builtin-tools: web search', 'builtin-tools: file search', 'builtin-tools: code interpreter', 'builtin-tools: computer use', 'builtin-tools: file input inline'])
const responsesContracts = Object.fromEntries(Object.entries(_allContracts).filter(([n]) => !exclude.has(n)))
import { config } from '../contracts/lib/config'
import { withRetry } from '../contracts/lib/withRetry'
import { supercompat, azureOpenaiClientAdapter, completionsRunAdapter, prismaStorageAdapter } from '../../../src/openai/index'
import { PrismaClient } from '@prisma/client'
import { createTestPrisma } from '../../lib/testPrisma'

const apiKey = process.env.TEST_AZURE_OPENAI_API_KEY
const endpoint = process.env.TEST_AZURE_OPENAI_ENDPOINT
if (!apiKey || !endpoint) { console.log('Skipping: TEST_AZURE_OPENAI_API_KEY and TEST_AZURE_OPENAI_ENDPOINT required'); process.exit(0) }
if (!process.env.DATABASE_URL) { console.log('Skipping: DATABASE_URL required'); process.exit(0) }

function createClient() {
  config.model = 'gpt-4.1-mini'
  return supercompat({
    clientAdapter: azureOpenaiClientAdapter({ azureOpenai: new AzureOpenAI({ apiKey, endpoint, apiVersion: '2024-10-21' }) }),
    runAdapter: completionsRunAdapter(),
    storageAdapter: prismaStorageAdapter({ prisma: createTestPrisma() }),
  })
}

describe('Responses API: prisma + Azure OpenAI', { concurrency: true, timeout: 60_000 }, () => {
  for (const [name, contract] of Object.entries(responsesContracts)) {
    test(name, { concurrency: true, timeout: 60_000 }, () => withRetry(() => contract(createClient()), { label: name }))
  }
})
