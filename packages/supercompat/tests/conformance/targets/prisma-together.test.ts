/**
 * Conformance: prismaStorageAdapter + completionsRunAdapter + Together AI
 */
import { test, describe } from 'node:test'
import OpenAI from 'openai'
import { completionsContracts } from '../contracts'
import { createPrismaTestClient } from '../lib/prismaTestHelper'
import { togetherClientAdapter } from '../../../src/index'

const apiKey = process.env.TOGETHER_API_KEY
if (!apiKey) {
  console.log('Skipping: TOGETHER_API_KEY required')
  process.exit(0)
}
if (!process.env.DATABASE_URL) {
  console.log('Skipping: DATABASE_URL required')
  process.exit(0)
}

describe('prismaStorageAdapter + Together', { timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(completionsContracts)) {
    test(name, { timeout: 120_000 }, async () => contract(await createPrismaTestClient({
      clientAdapter: togetherClientAdapter({
        together: new OpenAI({ apiKey, baseURL: 'https://api.together.xyz/v1' }),
      }),
      model: 'openai/gpt-oss-20b',
    })))
  }
})
