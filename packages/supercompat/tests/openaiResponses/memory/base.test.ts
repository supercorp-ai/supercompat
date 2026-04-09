/**
 * Responses API: memoryStorageAdapter + completionsRunAdapter + OpenAI
 */
import { test, describe } from 'node:test'
import OpenAI from 'openai'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { responsesContracts as _all } from '../contracts'

const exclude = new Set([
  'builtin-tools: web search', 'builtin-tools: file search',
  'builtin-tools: code interpreter', 'builtin-tools: computer use',
  'builtin-tools: file input inline',
])
const responsesContracts = Object.fromEntries(Object.entries(_all).filter(([n]) => !exclude.has(n)))
import { config } from '../contracts/lib/config'

const apiKey = process.env.TEST_OPENAI_API_KEY
if (!apiKey) {
  console.log('Skipping: TEST_OPENAI_API_KEY required')
  process.exit(0)
}

const proxyOpts = process.env.HTTPS_PROXY
  ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) as any }
  : {}

import {
  supercompat,
  openaiClientAdapter,
  completionsRunAdapter,
  memoryStorageAdapter,
} from '../../../src/openai/index'

function createClient() {
  config.model = 'gpt-4.1-mini'

  return supercompat({
    client: openaiClientAdapter({ openai: new OpenAI({ apiKey, ...proxyOpts }) }),
    runAdapter: completionsRunAdapter(),
    storage: memoryStorageAdapter(),
  })
}

describe('Responses API: memoryStorageAdapter + OpenAI', { timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(responsesContracts)) {
    test(name, { timeout: 120_000 }, () => contract(createClient()))
  }
})
