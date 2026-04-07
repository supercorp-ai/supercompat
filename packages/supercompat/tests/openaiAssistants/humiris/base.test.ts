/**
 * Conformance: prismaStorageAdapter + completionsRunAdapter + Humiris
 */
import { test, describe } from 'node:test'
import OpenAI from 'openai'
import { completionsContracts } from '../contracts'
import { createPrismaTestClient } from '../contracts/lib/prismaTestHelper'
import { humirisClientAdapter } from '../../../src/openai/index'

// Humiris API is currently unavailable/deprecated — skip all tests
// TODO: re-enable when Humiris service is restored
console.log('Skipping: Humiris API is currently unavailable')
process.exit(0)

const apiKey = process.env.HUMIRIS_API_KEY
if (!apiKey) {
  console.log('Skipping: HUMIRIS_API_KEY required')
  process.exit(0)
}
if (!process.env.DATABASE_URL) {
  console.log('Skipping: DATABASE_URL required')
  process.exit(0)
}

describe('prismaStorageAdapter + Humiris', { timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(completionsContracts)) {
    test(name, { timeout: 120_000 }, async () => contract(await createPrismaTestClient({
      clientAdapter: humirisClientAdapter({
        humiris: new OpenAI({
          apiKey,
          baseURL: 'https://moai-service-app.humiris.ai/api/openai/v1/',
          defaultHeaders: { 'moai-api-key': apiKey },
        }),
      }),
      model: 'gpt-4.1-mini',
    })))
  }
})
