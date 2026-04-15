/**
 * Conformance: memoryStorageAdapter + completionsRunAdapter + OpenRouter
 */
import { test, describe } from 'node:test'
import { OpenRouter } from '@openrouter/sdk'
import { completionsContracts } from '../contracts'
import { createMemoryTestClient } from '../contracts/lib/memoryTestHelper'
import { openRouterClientAdapter } from '../../../src/openai/index'

const apiKey = process.env.OPENROUTER_API_KEY
if (!apiKey) {
  console.log('Skipping: OPENROUTER_API_KEY required')
  process.exit(0)
}

describe('memoryStorageAdapter + OpenRouter', { concurrency: true, timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(completionsContracts)) {
    test(name, { concurrency: true, timeout: 120_000 }, async () => contract(await createMemoryTestClient({
      clientAdapter: openRouterClientAdapter({ openRouter: new OpenRouter({ apiKey }) }),
      model: 'anthropic/claude-sonnet-4',
    })))
  }
})
