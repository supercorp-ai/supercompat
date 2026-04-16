/**
 * Conformance: memoryStorageAdapter + completionsRunAdapter + Google Gemini
 */
import { test, describe } from 'node:test'
import { GoogleGenAI } from '@google/genai'
import { completionsContracts } from '../contracts'
import { createMemoryTestClient } from '../contracts/lib/memoryTestHelper'
import { googleClientAdapter } from '../../../src/openai/index'

const apiKey = process.env.GOOGLE_API_KEY
if (!apiKey) {
  console.log('Skipping: GOOGLE_API_KEY required')
  process.exit(0)
}

describe('memoryStorageAdapter + Google Gemini', { concurrency: true, timeout: 60_000 }, () => {
  for (const [name, contract] of Object.entries(completionsContracts)) {
    test(name, { concurrency: true, timeout: 60_000 }, async () => contract(await createMemoryTestClient({
      clientAdapter: googleClientAdapter({ google: new GoogleGenAI({ apiKey }) }),
      model: 'gemini-2.5-flash',
    })))
  }
})
