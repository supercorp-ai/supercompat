/**
 * Conformance: memoryStorageAdapter + completionsRunAdapter + Anthropic
 */
import { test, describe } from 'node:test'
import Anthropic from '@anthropic-ai/sdk'
import { completionsContracts } from '../contracts'
import { createMemoryTestClient } from '../contracts/lib/memoryTestHelper'
import { anthropicClientAdapter } from '../../../src/openai/index'

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.log('Skipping: ANTHROPIC_API_KEY required')
  process.exit(0)
}

describe('memoryStorageAdapter + Anthropic', { concurrency: true, timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(completionsContracts)) {
    test(name, { concurrency: true, timeout: 120_000 }, async () => contract(await createMemoryTestClient({
      clientAdapter: anthropicClientAdapter({ anthropic: new Anthropic({ apiKey }) }),
      model: 'claude-sonnet-4-20250514',
    })))
  }
})
