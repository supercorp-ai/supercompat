/**
 * Conformance: prismaStorageAdapter + completionsRunAdapter + Google Gemini
 */
import { test, describe } from 'node:test'
import { GoogleGenAI } from '@google/genai'
import { completionsContracts } from '../contracts'
import { createPrismaTestClient } from '../contracts/lib/prismaTestHelper'
import { googleClientAdapter } from '../../../src/openaiAssistants/index'

const apiKey = process.env.GOOGLE_API_KEY
if (!apiKey) {
  console.log('Skipping: GOOGLE_API_KEY required')
  process.exit(0)
}
if (!process.env.DATABASE_URL) {
  console.log('Skipping: DATABASE_URL required')
  process.exit(0)
}

describe('prismaStorageAdapter + Google', { timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(completionsContracts)) {
    test(name, { timeout: 120_000 }, async () => contract(await createPrismaTestClient({
      clientAdapter: googleClientAdapter({ google: new GoogleGenAI({ apiKey }) }),
      model: 'gemini-2.5-flash',
    })))
  }
})
