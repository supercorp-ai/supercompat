/**
 * Conformance baseline: runs all contracts against the real OpenAI Assistants API.
 * This is the source of truth. If a contract fails here, the contract is wrong.
 * If it passes here but fails on an adapter, the adapter has a bug.
 */
import { test, describe } from 'node:test'
import { contracts } from '../contracts'
import { createBaselineClient } from '../contracts/lib/clients'
import { withRetry } from '../contracts/lib/withRetry'

const apiKey = process.env.TEST_OPENAI_API_KEY
if (!apiKey) {
  console.log('Skipping baseline: TEST_OPENAI_API_KEY required')
  process.exit(0)
}

describe('Baseline: OpenAI Assistants API', { concurrency: true, timeout: 60_000 }, () => {
  const client = createBaselineClient()

  for (const [name, contract] of Object.entries(contracts)) {
    const slow = name.includes('file search') || name.includes('file_search') || name.includes('annotation indexes')
    test(name, { concurrency: true, timeout: slow ? 240_000 : 120_000 }, () =>
      withRetry(() => contract(client), { label: name, delayMs: slow ? 5000 : 2000 }))
  }
})
