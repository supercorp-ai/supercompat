/**
 * Conformance: prismaStorageAdapter + completionsRunAdapter + Groq
 * Groq free tier has a 6000 TPM limit, so we add a delay between tests.
 */
import { test, describe, beforeEach } from 'node:test'
import Groq from 'groq-sdk'
import { completionsContracts } from '../contracts'
import { createPrismaTestClient } from '../contracts/lib/prismaTestHelper'
import { withRetry } from '../contracts/lib/withRetry'
import { groqClientAdapter } from '../../../src/openai/index'

const apiKey = process.env.GROQ_API_KEY
if (!apiKey) { console.log('Skipping: GROQ_API_KEY required'); process.exit(0) }
if (process.env.SKIP_PROVIDERS?.split(',').includes('groq')) { console.log('Skipping: groq in SKIP_PROVIDERS'); process.exit(0) }
if (!process.env.DATABASE_URL) {
  console.log('Skipping: DATABASE_URL required')
  process.exit(0)
}

describe('prismaStorageAdapter + Groq', { timeout: 60_000, concurrency: 1 }, () => {
  beforeEach(() => new Promise(r => setTimeout(r, 3000)))

  for (const [name, contract] of Object.entries(completionsContracts)) {
    test(name, { timeout: 60_000 }, () =>
      withRetry(async () => contract(await createPrismaTestClient({
        clientAdapter: groqClientAdapter({ groq: new Groq({ apiKey }) }),
        model: 'llama-3.3-70b-versatile',
      })), { label: name, delayMs: 5000 }))
  }
})
