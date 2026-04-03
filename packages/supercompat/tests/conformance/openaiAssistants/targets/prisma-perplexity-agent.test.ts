/**
 * Conformance: prismaStorageAdapter + perplexityAgentRunAdapter + Perplexity Agent API
 *
 * Uses Perplexity's /v1/agent endpoint which supports function calling.
 */
import { test, describe } from 'node:test'
import OpenAI from 'openai'
import { completionsContracts as _completionsContracts } from '../contracts'

// Perplexity Agent API doesn't support parallel tool calls —
// it returns one tool call at a time, not multiple in a single response.
const { 'tools: parallel tool calls': _, ...completionsContracts } = _completionsContracts
import { createPrismaTestClient } from '../lib/prismaTestHelper'
import {
  perplexityClientAdapter,
  perplexityAgentRunAdapter,
} from '../../../../src/index'

const apiKey = process.env.PERPLEXITY_API_KEY
if (!apiKey) {
  console.log('Skipping: PERPLEXITY_API_KEY required')
  process.exit(0)
}
if (!process.env.DATABASE_URL) {
  console.log('Skipping: DATABASE_URL required')
  process.exit(0)
}

describe('prismaStorageAdapter + Perplexity Agent', { timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(completionsContracts)) {
    test(name, { timeout: 120_000 }, async () => contract(await createPrismaTestClient({
      clientAdapter: perplexityClientAdapter({
        perplexity: new OpenAI({ apiKey, baseURL: 'https://api.perplexity.ai' }),
      }),
      model: 'openai/gpt-4.1-mini',
      runAdapter: perplexityAgentRunAdapter({ apiKey }),
    })))
  }
})
