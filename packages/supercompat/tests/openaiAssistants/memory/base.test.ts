/**
 * Conformance: memoryStorageAdapter + completionsRunAdapter + OpenAI
 */
import { test, describe } from 'node:test'
import OpenAI from 'openai'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { completionsContracts } from '../contracts'
import { createMemoryTestClient } from '../contracts/lib/memoryTestHelper'
import {
  openaiClientAdapter,
} from '../../../src/openai/index'

const apiKey = process.env.TEST_OPENAI_API_KEY
if (!apiKey) {
  console.log('Skipping: TEST_OPENAI_API_KEY required')
  process.exit(0)
}

const proxyOpts = process.env.HTTPS_PROXY
  ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) as any }
  : {}

describe('memoryStorageAdapter + OpenAI', { concurrency: true, timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(completionsContracts)) {
    test(name, { concurrency: true, timeout: 120_000 }, async () => contract(await createMemoryTestClient({
      clientAdapter: openaiClientAdapter({ openai: new OpenAI({ apiKey, ...proxyOpts }) }),
      model: 'gpt-4.1-mini',
    })))
  }
})
