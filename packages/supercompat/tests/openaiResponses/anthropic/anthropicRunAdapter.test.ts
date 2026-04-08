/**
 * Responses API: anthropicRunAdapter + Anthropic
 * Uses Anthropic's native beta tools (web_search, code_execution, computer_use).
 */
import { test, describe } from 'node:test'
import Anthropic from '@anthropic-ai/sdk'
import { responsesContracts as _all } from '../contracts'
import { config } from '../contracts/lib/config'
import {
  supercompat,
  anthropicClientAdapter,
  anthropicRunAdapter,
  prismaStorageAdapter,
} from '../../../src/openai/index'
import { PrismaClient } from '@prisma/client'

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) { console.log('Skipping: ANTHROPIC_API_KEY required'); process.exit(0) }
if (!process.env.DATABASE_URL) { console.log('Skipping: DATABASE_URL required'); process.exit(0) }

// Exclude: conversation-dependent (dual storage), computer_use (needs special setup),
// file_search (Anthropic doesn't support it), structured output (Anthropic format differs)
const exclude = new Set([
  'streaming: previous_response_id chaining',
  'conversations: multi-turn',
  'conversations: input items',
  'conversations: item retrieve',
  'params: max_output_tokens',
  'builtin-tools: file search',
  'builtin-tools: computer use',
  'params: structured output',
])
const responsesContracts = Object.fromEntries(Object.entries(_all).filter(([n]) => !exclude.has(n)))

function createClient() {
  config.model = 'claude-sonnet-4-6'
  const anthropic = new Anthropic({ apiKey })

  return supercompat({
    client: anthropicClientAdapter({ anthropic }),
    runAdapter: anthropicRunAdapter({ anthropic }),
    storage: prismaStorageAdapter({ prisma: new PrismaClient() }),
  })
}

describe('Responses API: anthropicRunAdapter + Anthropic', { timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(responsesContracts)) {
    test(name, { timeout: 120_000 }, () => contract(createClient()))
  }
})
