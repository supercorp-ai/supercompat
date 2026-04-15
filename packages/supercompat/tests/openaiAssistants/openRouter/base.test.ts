/**
 * Conformance: prismaStorageAdapter + completionsRunAdapter + OpenRouter
 */
import { test, describe } from 'node:test'
import { OpenRouter } from '@openrouter/sdk'
import { completionsContracts } from '../contracts'
import { createPrismaTestClient } from '../contracts/lib/prismaTestHelper'
import { openRouterClientAdapter } from '../../../src/openai/index'

const apiKey = process.env.OPENROUTER_API_KEY
if (!apiKey) {
  console.log('Skipping: OPENROUTER_API_KEY required')
  process.exit(0)
}
if (!process.env.DATABASE_URL) {
  console.log('Skipping: DATABASE_URL required')
  process.exit(0)
}

describe('prismaStorageAdapter + OpenRouter', { concurrency: true, timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(completionsContracts)) {
    test(name, { concurrency: true, timeout: 120_000 }, async () => contract(await createPrismaTestClient({
      clientAdapter: openRouterClientAdapter({ openRouter: new OpenRouter({ apiKey }) }),
      model: 'anthropic/claude-sonnet-4',
    })))
  }
})
