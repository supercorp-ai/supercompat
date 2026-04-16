/**
 * Conformance: memoryStorageAdapter + completionsRunAdapter + Together AI
 */
import { test, describe } from 'node:test'
import OpenAI from 'openai'
import { completionsContracts } from '../contracts'
import { createMemoryTestClient } from '../contracts/lib/memoryTestHelper'
import { withRetry } from '../../openaiResponses/contracts/lib/withRetry'
import { togetherClientAdapter } from '../../../src/openai/index'

const apiKey = process.env.TOGETHER_API_KEY
if (!apiKey) {
  console.log('Skipping: TOGETHER_API_KEY required')
  process.exit(0)
}

// Together does not support parallel tool calls
const filtered = Object.fromEntries(
  Object.entries(completionsContracts).filter(([name]) => name !== 'tools: parallel tool calls')
)

describe('memoryStorageAdapter + Together', { concurrency: 1, timeout: 60_000 }, () => {
  for (const [name, contract] of Object.entries(filtered)) {
    test(name, { concurrency: 1, timeout: 60_000 }, () => withRetry(async () => contract(await createMemoryTestClient({
      clientAdapter: togetherClientAdapter({
        together: new OpenAI({ apiKey, baseURL: 'https://api.together.xyz/v1' }),
      }),
      model: 'openai/gpt-oss-120b',
    })), { label: name }))
  }
})
