import { test, describe } from 'node:test'
import OpenAI from 'openai'
import { responsesContracts as _all } from '../contracts'
import { config } from '../lib/config'
import { supercompat, perplexityClientAdapter, completionsRunAdapter, prismaStorageAdapter } from '../../../../src/openaiResponses/index'
import { PrismaClient } from '@prisma/client'

const apiKey = process.env.PERPLEXITY_API_KEY
if (!apiKey) { console.log('Skipping: PERPLEXITY_API_KEY required'); process.exit(0) }
if (!process.env.DATABASE_URL) { console.log('Skipping: DATABASE_URL required'); process.exit(0) }

// Perplexity doesn't support function calling or built-in tools via /chat/completions
const exclude = new Set([
  'tools: function call', 'tools: function call round-trip', 'tools: parallel function calls',
  'builtin-tools: web search', 'builtin-tools: file search', 'builtin-tools: code interpreter', 'builtin-tools: computer use',
  'params: tool_choice',
])
const responsesContracts = Object.fromEntries(Object.entries(_all).filter(([n]) => !exclude.has(n)))

function createClient() {
  config.model = 'sonar-pro'
  return supercompat({
    client: perplexityClientAdapter({ perplexity: new OpenAI({ apiKey, baseURL: 'https://api.perplexity.ai' }) }),
    runAdapter: completionsRunAdapter(),
    storage: prismaStorageAdapter({ prisma: new PrismaClient() }),
  })
}

describe('Responses API: prisma + Perplexity', { timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(responsesContracts)) {
    test(name, { timeout: 120_000 }, () => contract(createClient()))
  }
})
