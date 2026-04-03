/**
 * Conformance: prismaStorageAdapter + completionsRunAdapter + Anthropic
 */
import { test, describe } from 'node:test'
import Anthropic from '@anthropic-ai/sdk'
import { completionsContracts } from '../contracts'
import { createPrismaTestClient } from '../lib/prismaTestHelper'
import { anthropicClientAdapter } from '../../../src/index'

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.log('Skipping: ANTHROPIC_API_KEY required')
  process.exit(0)
}
if (!process.env.DATABASE_URL) {
  console.log('Skipping: DATABASE_URL required')
  process.exit(0)
}

describe('prismaStorageAdapter + Anthropic', { timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(completionsContracts)) {
    test(name, { timeout: 120_000 }, async () => contract(await createPrismaTestClient({
      clientAdapter: anthropicClientAdapter({ anthropic: new Anthropic({ apiKey }) }),
      model: 'claude-sonnet-4-20250514',
    })))
  }
})
