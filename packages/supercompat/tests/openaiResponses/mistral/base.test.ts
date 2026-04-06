import { test, describe } from 'node:test'
import { responsesContracts as _allContracts } from '../contracts'

const exclude = new Set(['builtin-tools: web search', 'builtin-tools: file search', 'builtin-tools: code interpreter', 'builtin-tools: computer use'])
const responsesContracts = Object.fromEntries(Object.entries(_allContracts).filter(([n]) => !exclude.has(n)))
import { config } from '../contracts/lib/config'
import { supercompat, mistralClientAdapter, completionsRunAdapter, prismaStorageAdapter } from '../../../src/openaiResponses/index'
import { PrismaClient } from '@prisma/client'

import { Mistral } from '@mistralai/mistralai'


const apiKey = process.env.MISTRAL_API_KEY
if (!apiKey) { console.log('Skipping: mistral key required'); process.exit(0) }
if (!process.env.DATABASE_URL) { console.log('Skipping: DATABASE_URL required'); process.exit(0) }


const model = 'mistral-small-latest'


function createClient() {
  config.model = model

  const providerClient = new Mistral({ apiKey })

  return supercompat({
    client: mistralClientAdapter({ mistral: providerClient }),
    runAdapter: completionsRunAdapter(),
    storage: prismaStorageAdapter({ prisma: new PrismaClient() }),
  })
}

describe('Responses API: prisma + mistral', { timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(responsesContracts)) {
    test(name, { timeout: 120_000 }, () => contract(createClient()))
  }
})
