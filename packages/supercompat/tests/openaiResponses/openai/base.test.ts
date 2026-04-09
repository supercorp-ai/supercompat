/**
 * Responses API: prismaStorageAdapter + completionsRunAdapter + OpenAI
 * Tests the existing openaiResponses adapter against Responses API contracts.
 */
import { test, describe } from 'node:test'
import OpenAI from 'openai'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { responsesContracts as _all } from '../contracts'

// Built-in tools (web_search, file_search, code_interpreter, computer) only work
// via the real Responses API, not through the completions adapter
const exclude = new Set([
  'builtin-tools: web search', 'builtin-tools: file search',
  'builtin-tools: code interpreter', 'builtin-tools: computer use',
  'builtin-tools: file input inline',
])
const responsesContracts = Object.fromEntries(Object.entries(_all).filter(([n]) => !exclude.has(n)))
import { config } from '../contracts/lib/config'

const apiKey = process.env.TEST_OPENAI_API_KEY
if (!apiKey) {
  console.log('Skipping: TEST_OPENAI_API_KEY required')
  process.exit(0)
}
if (!process.env.DATABASE_URL) {
  console.log('Skipping: DATABASE_URL required')
  process.exit(0)
}

const proxyOpts = process.env.HTTPS_PROXY
  ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) as any }
  : {}

// Import from the openaiResponses surface
import {
  supercompat,
  openaiClientAdapter,
  completionsRunAdapter,
  prismaStorageAdapter,
} from '../../../src/openai/index'
import { PrismaClient } from '@prisma/client'

function createClient(): OpenAI {
  config.model = 'gpt-4.1-mini'
  const prisma = new PrismaClient()
  const realOpenAI = new OpenAI({ apiKey, ...proxyOpts })

  return supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: completionsRunAdapter(),
    storage: prismaStorageAdapter({ prisma }),
  })
}

describe('Responses API: prismaStorageAdapter + OpenAI', { timeout: 300_000 }, () => {
  for (const [name, contract] of Object.entries(responsesContracts)) {
    test(name, { timeout: 120_000 }, () => contract(createClient()))
  }
})
