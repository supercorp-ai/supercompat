import { test, describe } from 'node:test'
import { responsesContracts as _allContracts } from '../contracts'

const exclude = new Set(['builtin-tools: web search', 'builtin-tools: file search', 'builtin-tools: code interpreter', 'builtin-tools: computer use'])
const responsesContracts = Object.fromEntries(Object.entries(_allContracts).filter(([n]) => !exclude.has(n)))
import { config } from '../lib/config'
import { supercompat, googleClientAdapter, completionsRunAdapter, prismaStorageAdapter } from '../../../../src/openaiResponses/index'
import { PrismaClient } from '@prisma/client'


import { GoogleGenAI } from '@google/genai'

const apiKey = process.env.GOOGLE_API_KEY
if (!apiKey) { console.log('Skipping: google key required'); process.exit(0) }
if (!process.env.DATABASE_URL) { console.log('Skipping: DATABASE_URL required'); process.exit(0) }



const model = 'gemini-2.5-flash'

function createClient() {
  config.model = model


  const providerClient = new GoogleGenAI({ apiKey })
  return supercompat({
    client: googleClientAdapter({ google: providerClient }),
    runAdapter: completionsRunAdapter(),
    storage: prismaStorageAdapter({ prisma: new PrismaClient() }),
  })
}

describe('Responses API: prisma + google', { timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(responsesContracts)) {
    test(name, { timeout: 120_000 }, () => contract(createClient()))
  }
})
