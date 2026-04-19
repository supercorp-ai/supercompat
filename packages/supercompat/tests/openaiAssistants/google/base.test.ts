/**
 * Conformance: prismaStorageAdapter + completionsRunAdapter + Google Gemini
 */
import { test, describe } from 'node:test'
import { GoogleGenAI } from '@google/genai'
import { completionsContracts } from '../contracts'
import { createPrismaTestClient } from '../contracts/lib/prismaTestHelper'
import { withRetry } from '../contracts/lib/withRetry'
import { googleClientAdapter } from '../../../src/openai/index'

const apiKey = process.env.GOOGLE_API_KEY
if (!apiKey) {
  console.log('Skipping: GOOGLE_API_KEY required')
  process.exit(0)
}
if (!process.env.DATABASE_URL) {
  console.log('Skipping: DATABASE_URL required')
  process.exit(0)
}

// Google's Gemini Chat Completions API doesn't reliably emit multiple
// parallel tool calls in a single response — it's been observed returning
// only one of two requested tools under load. Excluding the contract here
// mirrors what we do for Together (which has a hard platform limitation).
const exclude = new Set(['tools: parallel tool calls'])
const filteredContracts = Object.fromEntries(
  Object.entries(completionsContracts).filter(([n]) => !exclude.has(n)),
)

describe('prismaStorageAdapter + Google', { concurrency: true, timeout: 180_000 }, () => {
  for (const [name, contract] of Object.entries(filteredContracts)) {
    test(name, { concurrency: true, timeout: 180_000 }, () =>
      withRetry(async () => contract(await createPrismaTestClient({
        clientAdapter: googleClientAdapter({ google: new GoogleGenAI({ apiKey }) }),
        model: 'gemini-2.5-flash',
      })), { label: name, delayMs: 3000 }))
  }
})
