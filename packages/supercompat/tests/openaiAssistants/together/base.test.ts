/**
 * Conformance: prismaStorageAdapter + completionsRunAdapter + Together AI
 */
import { test, describe } from 'node:test'
import OpenAI from 'openai'
import { completionsContracts } from '../contracts'
import { createPrismaTestClient } from '../contracts/lib/prismaTestHelper'
import { withRetry } from '../contracts/lib/withRetry'
import { togetherClientAdapter } from '../../../src/openai/index'

const apiKey = process.env.TOGETHER_API_KEY
if (!apiKey) {
  console.log('Skipping: TOGETHER_API_KEY required')
  process.exit(0)
}
if (!process.env.DATABASE_URL) {
  console.log('Skipping: DATABASE_URL required')
  process.exit(0)
}

// Together API does not support parallel tool calls — platform limitation
const exclude = new Set(['tools: parallel tool calls'])
const filteredContracts = Object.fromEntries(Object.entries(completionsContracts).filter(([n]) => !exclude.has(n)))

describe('prismaStorageAdapter + Together', { concurrency: 1, timeout: 180_000 }, () => {
  for (const [name, contract] of Object.entries(filteredContracts)) {
    // Together free tier is 60 RPM (1 QPS) — retry with generous backoff to
    // absorb rate-limit bursts when the whole suite is running in parallel.
    test(name, { concurrency: 1, timeout: 180_000 }, () =>
      withRetry(async () => contract(await createPrismaTestClient({
        clientAdapter: togetherClientAdapter({
          together: new OpenAI({ apiKey, baseURL: 'https://api.together.xyz/v1' }),
        }),
        model: 'openai/gpt-oss-120b',
      })), { label: name, delayMs: 5000 }))
  }
})
