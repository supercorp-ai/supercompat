/**
 * Conformance: prismaStorageAdapter + completionsRunAdapter + Mistral
 */
import { test, describe } from 'node:test'
import { Mistral } from '@mistralai/mistralai'
import { completionsContracts } from '../contracts'
import { createPrismaTestClient } from '../contracts/lib/prismaTestHelper'
import { mistralClientAdapter } from '../../../src/openai/index'

const apiKey = process.env.MISTRAL_API_KEY
if (!apiKey) {
  console.log('Skipping: MISTRAL_API_KEY required')
  process.exit(0)
}
if (!process.env.DATABASE_URL) {
  console.log('Skipping: DATABASE_URL required')
  process.exit(0)
}

describe('prismaStorageAdapter + Mistral', { concurrency: true, timeout: 60_000 }, () => {
  for (const [name, contract] of Object.entries(completionsContracts)) {
    test(name, { concurrency: true, timeout: 60_000 }, async () => contract(await createPrismaTestClient({
      clientAdapter: mistralClientAdapter({ mistral: new Mistral({ apiKey }) }),
      model: 'mistral-small-latest',
    })))
  }
})
