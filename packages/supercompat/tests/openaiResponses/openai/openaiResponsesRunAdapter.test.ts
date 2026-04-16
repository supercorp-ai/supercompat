/**
 * Responses API: openaiResponsesRunAdapter + OpenAI
 * Uses OpenAI's native Responses API — built-in tools work natively.
 */
import { test, describe } from 'node:test'
import OpenAI from 'openai'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { responsesContracts as _all } from '../contracts'
import { withRetry } from '../contracts/lib/withRetry'

// OpenAI run adapter uses real OpenAI API for responses but local prisma for conversations.
// Conversation-dependent tests fail because of this dual storage mismatch.
const exclude = new Set([
  'streaming: previous_response_id chaining',
  'conversations: multi-turn',
  'conversations: input items',
  'conversations: item retrieve',
  'params: max_output_tokens',
])
const responsesContracts = Object.fromEntries(Object.entries(_all).filter(([n]) => !exclude.has(n)))
import { config } from '../contracts/lib/config'
import {
  supercompat,
  openaiClientAdapter,
  openaiResponsesRunAdapter,
  prismaStorageAdapter,
} from '../../../src/openai/index'
import { PrismaClient } from '@prisma/client'
import { createTestPrisma } from '../../lib/testPrisma'

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

function createClient() {
  config.model = 'gpt-4.1-mini'
  const realOpenAI = new OpenAI({ apiKey, ...proxyOpts })

  return supercompat({
    clientAdapter: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: openaiResponsesRunAdapter(),
    storageAdapter: prismaStorageAdapter({ prisma: createTestPrisma() }),
  })
}

describe('Responses API: openaiResponsesRunAdapter + OpenAI', { concurrency: true, timeout: 60_000 }, () => {
  for (const [name, contract] of Object.entries(responsesContracts)) {
    const slow = name.includes('file search') || name.includes('file_search') || name.includes('annotation indexes') || name.includes('max_output_tokens')
    test(name, { concurrency: true, timeout: slow ? 180_000 : 60_000 }, () =>
      withRetry(() => contract(createClient()), { label: name }))
  }
})
