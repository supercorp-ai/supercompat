/**
 * Conformance: memoryStorageAdapter + completionsRunAdapter + Perplexity
 * Perplexity does not support function calling, so uses noToolsContracts.
 */
import { test, describe } from 'node:test'
import OpenAI from 'openai'
import { noToolsContracts } from '../contracts'
import { createMemoryTestClient } from '../contracts/lib/memoryTestHelper'
import { perplexityClientAdapter } from '../../../src/openai/index'

const apiKey = process.env.PERPLEXITY_API_KEY
if (!apiKey) {
  console.log('Skipping: PERPLEXITY_API_KEY required')
  process.exit(0)
}

describe('memoryStorageAdapter + Perplexity', { concurrency: true, timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(noToolsContracts)) {
    test(name, { concurrency: true, timeout: 120_000 }, async () => contract(await createMemoryTestClient({
      clientAdapter: perplexityClientAdapter({
        perplexity: new OpenAI({ apiKey, baseURL: 'https://api.perplexity.ai' }),
      }),
      model: 'sonar-pro',
    })))
  }
})
