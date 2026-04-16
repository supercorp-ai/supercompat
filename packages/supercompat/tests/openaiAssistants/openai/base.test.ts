/**
 * Conformance: prismaStorageAdapter + completionsRunAdapter + OpenAI
 */
import { test, describe } from 'node:test'
import OpenAI from 'openai'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { completionsContracts } from '../contracts'
import { createPrismaTestClient } from '../contracts/lib/prismaTestHelper'
import { openaiClientAdapter } from '../../../src/openai/index'

const apiKey = process.env.TEST_OPENAI_API_KEY
if (!apiKey) {
  console.log('Skipping: TEST_OPENAI_API_KEY required')
  process.exit(0)
}
if (!process.env.DATABASE_URL) {
  console.log('Skipping: DATABASE_URL required')
  process.exit(0)
}

const proxyOpts = process.env.HTTPS_PROXY
  ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) as any }
  : {}

describe('prismaStorageAdapter + OpenAI', { concurrency: true, timeout: 60_000 }, () => {
  for (const [name, contract] of Object.entries(completionsContracts)) {
    test(name, { concurrency: true, timeout: 60_000 }, async () => contract(await createPrismaTestClient({
      clientAdapter: openaiClientAdapter({ openai: new OpenAI({ apiKey, ...proxyOpts }) }),
      model: 'gpt-4.1-mini',
    })))
  }
})
