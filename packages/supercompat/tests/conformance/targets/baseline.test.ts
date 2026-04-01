/**
 * Conformance baseline: runs all contracts against the real OpenAI Assistants API.
 * This is the source of truth. If a contract fails here, the contract is wrong.
 * If it passes here but fails on an adapter, the adapter has a bug.
 */
import { test, describe } from 'node:test'
import { contracts } from '../contracts'
import { createBaselineClient } from '../lib/clients'

const apiKey = process.env.TEST_OPENAI_API_KEY
if (!apiKey) {
  console.log('Skipping baseline: TEST_OPENAI_API_KEY required')
  process.exit(0)
}

describe('Baseline: OpenAI Assistants API', { timeout: 120_000 }, () => {
  const client = createBaselineClient()

  for (const [name, contract] of Object.entries(contracts)) {
    test(name, { timeout: 60_000 }, () => contract(client))
  }
})
