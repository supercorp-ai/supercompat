/**
 * Responses API Baseline: runs all contracts against the real OpenAI Responses API.
 * This is the truth source for Responses API conformance.
 */
import { test, describe } from 'node:test'
import OpenAI from 'openai'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { responsesContracts } from '../contracts'
import { withRetry } from '../contracts/lib/withRetry'

const apiKey = process.env.TEST_OPENAI_API_KEY
if (!apiKey) {
  console.log('Skipping: TEST_OPENAI_API_KEY required')
  process.exit(0)
}

const proxyOpts = process.env.HTTPS_PROXY
  ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) as any }
  : {}

function createClient(): OpenAI {
  return new OpenAI({ apiKey, ...proxyOpts })
}

describe('Responses API Baseline', { concurrency: true, timeout: 60_000 }, () => {
  for (const [name, contract] of Object.entries(responsesContracts)) {
    const slow = name.includes('file search') || name.includes('file_search') || name.includes('annotation indexes') || name.includes('max_output_tokens')
    test(name, { concurrency: true, timeout: slow ? 180_000 : 60_000 }, () =>
      withRetry(() => contract(createClient()), { label: name }))
  }
})
