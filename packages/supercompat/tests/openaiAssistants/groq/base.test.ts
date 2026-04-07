/**
 * Conformance: prismaStorageAdapter + completionsRunAdapter + Groq
 */
import { test, describe } from 'node:test'
import Groq from 'groq-sdk'
import { completionsContracts } from '../contracts'
import { createPrismaTestClient } from '../contracts/lib/prismaTestHelper'
import { groqClientAdapter } from '../../../src/openai/index'

const apiKey = process.env.GROQ_API_KEY
if (!apiKey) {
  console.log('Skipping: GROQ_API_KEY required')
  process.exit(0)
}
if (!process.env.DATABASE_URL) {
  console.log('Skipping: DATABASE_URL required')
  process.exit(0)
}

describe('prismaStorageAdapter + Groq', { timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(completionsContracts)) {
    test(name, { timeout: 120_000 }, async () => contract(await createPrismaTestClient({
      clientAdapter: groqClientAdapter({ groq: new Groq({ apiKey }) }),
      model: 'qwen/qwen3-32b',
    })))
  }
})
