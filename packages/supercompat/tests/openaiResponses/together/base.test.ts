import { test, describe } from 'node:test'
import OpenAI from 'openai'
import { responsesContracts as _allContracts } from '../contracts'

// Together via completionsRunAdapter: no parallel tool calls, no built-in tools
const exclude = new Set(['builtin-tools: web search', 'builtin-tools: file search', 'builtin-tools: code interpreter', 'builtin-tools: computer use', 'builtin-tools: file input inline', 'tools: parallel function calls'])
const responsesContracts = Object.fromEntries(Object.entries(_allContracts).filter(([n]) => !exclude.has(n)))
import { config } from '../contracts/lib/config'
import { withRetry } from '../contracts/lib/withRetry'
import { supercompat, togetherClientAdapter, completionsRunAdapter, prismaStorageAdapter } from '../../../src/openai/index'
import { PrismaClient } from '@prisma/client'
import { createTestPrisma } from '../../lib/testPrisma'

const apiKey = process.env.TOGETHER_API_KEY
if (!apiKey) { console.log('Skipping: TOGETHER_API_KEY required'); process.exit(0) }
if (!process.env.DATABASE_URL) { console.log('Skipping: DATABASE_URL required'); process.exit(0) }

function createClient() {
  config.model = 'openai/gpt-oss-120b'
  return supercompat({
    clientAdapter: togetherClientAdapter({ together: new OpenAI({ apiKey, baseURL: 'https://api.together.xyz/v1' }) }),
    runAdapter: completionsRunAdapter(),
    storageAdapter: prismaStorageAdapter({ prisma: createTestPrisma() }),
  })
}

describe('Responses API: prisma + Together', { concurrency: true, timeout: 60_000 }, () => {
  for (const [name, contract] of Object.entries(responsesContracts)) {
    const slow = name.includes('file search') || name.includes('max_output_tokens')
    test(name, { concurrency: true, timeout: slow ? 180_000 : 60_000 }, () =>
      withRetry(() => contract(createClient()), { label: name }))
  }
})
