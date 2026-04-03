import { test, describe } from 'node:test'
import { AzureOpenAI } from 'openai'
import { responsesContracts as _allContracts } from '../contracts'

const exclude = new Set(['builtin-tools: web search', 'builtin-tools: file search', 'builtin-tools: code interpreter', 'builtin-tools: computer use'])
const responsesContracts = Object.fromEntries(Object.entries(_allContracts).filter(([n]) => !exclude.has(n)))
import { config } from '../lib/config'
import { supercompat, azureOpenaiClientAdapter, completionsRunAdapter, prismaStorageAdapter } from '../../../../src/openaiResponses/index'
import { PrismaClient } from '@prisma/client'

const apiKey = process.env.TEST_AZURE_OPENAI_API_KEY
const endpoint = process.env.TEST_AZURE_OPENAI_ENDPOINT
if (!apiKey || !endpoint) { console.log('Skipping: TEST_AZURE_OPENAI_API_KEY and TEST_AZURE_OPENAI_ENDPOINT required'); process.exit(0) }
if (!process.env.DATABASE_URL) { console.log('Skipping: DATABASE_URL required'); process.exit(0) }

function createClient() {
  config.model = 'gpt-4.1-mini'
  return supercompat({
    client: azureOpenaiClientAdapter({ azureOpenai: new AzureOpenAI({ apiKey, endpoint, apiVersion: '2024-10-21' }) }),
    runAdapter: completionsRunAdapter(),
    storage: prismaStorageAdapter({ prisma: new PrismaClient() }),
  })
}

describe('Responses API: prisma + Azure OpenAI', { timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(responsesContracts)) {
    test(name, { timeout: 120_000 }, () => contract(createClient()))
  }
})
