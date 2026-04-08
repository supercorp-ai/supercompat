/**
 * Conformance: memoryStorageAdapter + completionsRunAdapter + Groq
 */
import { test, describe } from 'node:test'
import Groq from 'groq-sdk'
import { completionsContracts } from '../contracts'
import { createMemoryTestClient } from '../contracts/lib/memoryTestHelper'
import { groqClientAdapter } from '../../../src/openai/index'

const apiKey = process.env.GROQ_API_KEY
if (!apiKey) {
  console.log('Skipping: GROQ_API_KEY required')
  process.exit(0)
}

describe('memoryStorageAdapter + Groq', { timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(completionsContracts)) {
    test(name, { timeout: 120_000 }, async () => contract(await createMemoryTestClient({
      clientAdapter: groqClientAdapter({ groq: new Groq({ apiKey }) }),
      model: 'qwen/qwen3-32b',
    })))
  }
})
