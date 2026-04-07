/**
 * Conformance: prismaStorageAdapter + completionsRunAdapter + Azure OpenAI
 */
import { test, describe } from 'node:test'
import { AzureOpenAI } from 'openai'
import { completionsContracts } from '../contracts'
import { createPrismaTestClient } from '../contracts/lib/prismaTestHelper'
import { azureOpenaiClientAdapter } from '../../../src/openai/index'

const apiKey = process.env.TEST_AZURE_OPENAI_API_KEY
const endpoint = process.env.TEST_AZURE_OPENAI_ENDPOINT
if (!apiKey || !endpoint) {
  console.log('Skipping: TEST_AZURE_OPENAI_API_KEY and TEST_AZURE_OPENAI_ENDPOINT required')
  process.exit(0)
}
if (!process.env.DATABASE_URL) {
  console.log('Skipping: DATABASE_URL required')
  process.exit(0)
}

describe('prismaStorageAdapter + Azure OpenAI', { timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(completionsContracts)) {
    test(name, { timeout: 120_000 }, async () => contract(await createPrismaTestClient({
      clientAdapter: azureOpenaiClientAdapter({
        azureOpenai: new AzureOpenAI({ apiKey, endpoint, apiVersion: '2024-10-21' }),
      }),
      model: 'gpt-4.1-mini',
    })))
  }
})
