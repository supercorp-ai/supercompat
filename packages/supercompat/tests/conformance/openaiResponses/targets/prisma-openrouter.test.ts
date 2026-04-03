import { test, describe } from 'node:test'
import { OpenRouter } from '@openrouter/sdk'
import { responsesContracts as _allContracts } from '../contracts'

const exclude = new Set(['builtin-tools: web search', 'builtin-tools: file search', 'builtin-tools: code interpreter', 'builtin-tools: computer use'])
const responsesContracts = Object.fromEntries(Object.entries(_allContracts).filter(([n]) => !exclude.has(n)))
import { config } from '../lib/config'
import { supercompat, openRouterClientAdapter, completionsRunAdapter, prismaStorageAdapter } from '../../../../src/openaiResponses/index'
import { PrismaClient } from '@prisma/client'

const apiKey = process.env.OPENROUTER_API_KEY
if (!apiKey) { console.log('Skipping: OPENROUTER_API_KEY required'); process.exit(0) }
if (!process.env.DATABASE_URL) { console.log('Skipping: DATABASE_URL required'); process.exit(0) }

function createClient() {
  config.model = 'anthropic/claude-sonnet-4'
  return supercompat({
    client: openRouterClientAdapter({ openRouter: new OpenRouter({ apiKey }) }),
    runAdapter: completionsRunAdapter(),
    storage: prismaStorageAdapter({ prisma: new PrismaClient() }),
  })
}

describe('Responses API: prisma + OpenRouter', { timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(responsesContracts)) {
    test(name, { timeout: 120_000 }, () => contract(createClient()))
  }
})
