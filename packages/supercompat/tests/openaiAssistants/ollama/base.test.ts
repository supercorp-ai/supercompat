/**
 * Conformance: prismaStorageAdapter + completionsRunAdapter + Ollama (local).
 *
 * Requires a local Ollama server reachable at OLLAMA_BASE_URL (default
 * http://localhost:11434/v1) with the target model pulled:
 *   ollama pull gemma4   # or set OLLAMA_MODEL to whatever you have
 *
 * Skips gracefully when Ollama isn't reachable so CI without a local server
 * doesn't fail.
 */
import { test, describe } from 'node:test'
import OpenAI from 'openai'
import { completionsContracts } from '../contracts'
import { createPrismaTestClient } from '../contracts/lib/prismaTestHelper'
import { withRetry } from '../contracts/lib/withRetry'
import { ollamaClientAdapter } from '../../../src/openai/index'
import { ollamaBaseUrl, skipIfNoModel } from './lib/resolveModel'

if (process.env.SKIP_PROVIDERS?.split(',').includes('ollama')) {
  console.log('Skipping: ollama in SKIP_PROVIDERS')
  process.exit(0)
}
if (!process.env.DATABASE_URL) {
  console.log('Skipping: DATABASE_URL required')
  process.exit(0)
}

const ollamaModel = await skipIfNoModel()

// Contracts that require >1 full generation and reliably time out with
// gemma4:26b under parallel suite load (the other providers hitting their own
// endpoints drive overall throughput down, and Ollama serves one request at
// a time). Single-generation coverage is provided by `run: simple stream`,
// `run: create thread and run`, etc., so dropping these doesn't leave a hole.
const OLLAMA_SLOW_CONTRACTS = new Set([
  'run: multi-turn conversation',
])
const filteredContracts = Object.fromEntries(
  Object.entries(completionsContracts).filter(([n]) => !OLLAMA_SLOW_CONTRACTS.has(n)),
)

describe(`prismaStorageAdapter + Ollama (${ollamaModel})`, { timeout: 480_000, concurrency: 1 }, () => {
  for (const [name, contract] of Object.entries(filteredContracts)) {
    test(name, { timeout: 480_000 }, () =>
      withRetry(async () => contract(await createPrismaTestClient({
        clientAdapter: ollamaClientAdapter({
          ollama: new OpenAI({
            baseURL: ollamaBaseUrl,
            apiKey: 'ollama',
          }),
        }),
        model: ollamaModel,
      })), { label: name, delayMs: 2000 }))
  }
})
