/**
 * Conformance: prismaStorageAdapter + completionsRunAdapter + Perplexity
 */
import { test, describe } from 'node:test'
import OpenAI from 'openai'
import { noToolsContracts } from '../contracts'
import { createPrismaTestClient } from '../contracts/lib/prismaTestHelper'
import { perplexityClientAdapter } from '../../../src/openai/index'

const apiKey = process.env.PERPLEXITY_API_KEY
if (!apiKey) {
  console.log('Skipping: PERPLEXITY_API_KEY required')
  process.exit(0)
}
if (!process.env.DATABASE_URL) {
  console.log('Skipping: DATABASE_URL required')
  process.exit(0)
}

describe('prismaStorageAdapter + Perplexity', { concurrency: true, timeout: 60_000 }, () => {
  for (const [name, contract] of Object.entries(noToolsContracts)) {
    test(name, { concurrency: true, timeout: 60_000 }, async () => contract(await createPrismaTestClient({
      clientAdapter: perplexityClientAdapter({
        perplexity: new OpenAI({ apiKey, baseURL: 'https://api.perplexity.ai' }),
      }),
      model: 'sonar-pro',
    })))
  }
})
