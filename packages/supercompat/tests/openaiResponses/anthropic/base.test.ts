import { test, describe } from 'node:test'
import Anthropic from '@anthropic-ai/sdk'
import { responsesContracts as _allContracts } from '../contracts'

const exclude = new Set(['builtin-tools: web search', 'builtin-tools: file search', 'builtin-tools: code interpreter', 'builtin-tools: computer use', 'builtin-tools: file input inline'])
const responsesContracts = Object.fromEntries(Object.entries(_allContracts).filter(([n]) => !exclude.has(n)))
import { config } from '../contracts/lib/config'
import { withRetry } from '../contracts/lib/withRetry'
import { supercompat, anthropicClientAdapter, completionsRunAdapter, prismaStorageAdapter } from '../../../src/openai/index'
import { PrismaClient } from '@prisma/client'

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) { console.log('Skipping: ANTHROPIC_API_KEY required'); process.exit(0) }
if (!process.env.DATABASE_URL) { console.log('Skipping: DATABASE_URL required'); process.exit(0) }

function createClient() {
  config.model = 'claude-sonnet-4-6'
  return supercompat({
    clientAdapter: anthropicClientAdapter({ anthropic: new Anthropic({ apiKey }) }),
    runAdapter: completionsRunAdapter(),
    storageAdapter: prismaStorageAdapter({ prisma: new PrismaClient() }),
  })
}

describe('Responses API: prismaStorageAdapter + Anthropic', { concurrency: true, timeout: 300_000 }, () => {
  for (const [name, contract] of Object.entries(responsesContracts)) {
    test(name, { concurrency: true, timeout: 120_000 }, () =>
      withRetry(() => contract(createClient()), { label: name }))
  }
})
