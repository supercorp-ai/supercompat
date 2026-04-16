import { test, describe } from 'node:test'
import OpenAI from 'openai'
import { responsesContracts as _all } from '../contracts'
import { config } from '../contracts/lib/config'
import { withRetry } from '../contracts/lib/withRetry'
import { supercompat, perplexityClientAdapter, completionsRunAdapter, prismaStorageAdapter } from '../../../src/openai/index'
import { PrismaClient } from '@prisma/client'
import { createTestPrisma } from '../../lib/testPrisma'

const apiKey = process.env.PERPLEXITY_API_KEY
if (!apiKey) { console.log('Skipping: PERPLEXITY_API_KEY required'); process.exit(0) }
if (!process.env.DATABASE_URL) { console.log('Skipping: DATABASE_URL required'); process.exit(0) }

// Perplexity doesn't support function calling or built-in tools via /chat/completions
const exclude = new Set([
  'tools: function call', 'tools: function call round-trip', 'tools: parallel function calls',
  'builtin-tools: web search', 'builtin-tools: file search', 'builtin-tools: code interpreter', 'builtin-tools: computer use', 'builtin-tools: file input inline',
  'params: tool_choice',
])
const responsesContracts = Object.fromEntries(Object.entries(_all).filter(([n]) => !exclude.has(n)))

function createClient() {
  config.model = 'sonar-pro'
  return supercompat({
    clientAdapter: perplexityClientAdapter({ perplexity: new OpenAI({ apiKey, baseURL: 'https://api.perplexity.ai' }) }),
    runAdapter: completionsRunAdapter(),
    storageAdapter: prismaStorageAdapter({ prisma: createTestPrisma() }),
  })
}

describe('Responses API: prisma + Perplexity', { concurrency: true, timeout: 60_000 }, () => {
  for (const [name, contract] of Object.entries(responsesContracts)) {
    test(name, { concurrency: true, timeout: 60_000 }, () => withRetry(() => contract(createClient()), { label: name }))
  }
})
