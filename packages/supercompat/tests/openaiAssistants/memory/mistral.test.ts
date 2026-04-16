/**
 * Conformance: memoryStorageAdapter + completionsRunAdapter + Mistral
 */
import { test, describe } from 'node:test'
import { Mistral } from '@mistralai/mistralai'
import { completionsContracts } from '../contracts'
import { createMemoryTestClient } from '../contracts/lib/memoryTestHelper'
import { mistralClientAdapter } from '../../../src/openai/index'

const apiKey = process.env.MISTRAL_API_KEY
if (!apiKey) {
  console.log('Skipping: MISTRAL_API_KEY required')
  process.exit(0)
}

describe('memoryStorageAdapter + Mistral', { concurrency: true, timeout: 60_000 }, () => {
  for (const [name, contract] of Object.entries(completionsContracts)) {
    test(name, { concurrency: true, timeout: 60_000 }, async () => contract(await createMemoryTestClient({
      clientAdapter: mistralClientAdapter({ mistral: new Mistral({ apiKey }) }),
      model: 'mistral-small-latest',
    })))
  }
})
