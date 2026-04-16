import { test, describe } from 'node:test'
import { responsesContracts as _allContracts } from '../contracts'

// llama-3.3-70b-versatile doesn't support json_schema response format
const exclude = new Set(['builtin-tools: web search', 'builtin-tools: file search', 'builtin-tools: code interpreter', 'builtin-tools: computer use', 'builtin-tools: file input inline', 'params: structured output'])
const responsesContracts = Object.fromEntries(Object.entries(_allContracts).filter(([n]) => !exclude.has(n)))
import { config } from '../contracts/lib/config'
import { withRetry } from '../contracts/lib/withRetry'
import { supercompat, groqClientAdapter, completionsRunAdapter, prismaStorageAdapter } from '../../../src/openai/index'
import { PrismaClient } from '@prisma/client'
import { createTestPrisma } from '../../lib/testPrisma'
import Groq from 'groq-sdk'

const apiKey = process.env.GROQ_API_KEY
if (!apiKey) { console.log('Skipping: groq key required'); process.exit(0) }
if (process.env.SKIP_PROVIDERS?.split(',').includes('groq')) { console.log('Skipping: groq in SKIP_PROVIDERS'); process.exit(0) }
if (!process.env.DATABASE_URL) { console.log('Skipping: DATABASE_URL required'); process.exit(0) }

const model = 'llama-3.3-70b-versatile'

function createClient() {
  config.model = model
  const providerClient = new Groq({ apiKey })

  return supercompat({
    clientAdapter: groqClientAdapter({ groq: providerClient }),
    runAdapter: completionsRunAdapter(),
    storageAdapter: prismaStorageAdapter({ prisma: createTestPrisma() }),
  })
}

describe('Responses API: prisma + groq', { timeout: 60_000, concurrency: 1 }, () => {
  for (const [name, contract] of Object.entries(responsesContracts)) {
    test(name, { timeout: 60_000 }, () =>
      withRetry(() => contract(createClient()), { label: name, delayMs: 5000 }))
  }
})
