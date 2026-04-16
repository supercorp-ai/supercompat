import { test, describe } from 'node:test'
import { responsesContracts as _allContracts } from '../contracts'

const exclude = new Set(['builtin-tools: web search', 'builtin-tools: file search', 'builtin-tools: code interpreter', 'builtin-tools: computer use', 'builtin-tools: file input inline'])
const responsesContracts = Object.fromEntries(Object.entries(_allContracts).filter(([n]) => !exclude.has(n)))
import { config } from '../contracts/lib/config'
import { withRetry } from '../contracts/lib/withRetry'
import { supercompat, mistralClientAdapter, completionsRunAdapter, prismaStorageAdapter } from '../../../src/openai/index'
import { PrismaClient } from '@prisma/client'
import { createTestPrisma } from '../../lib/testPrisma'

import { Mistral } from '@mistralai/mistralai'


const apiKey = process.env.MISTRAL_API_KEY
if (!apiKey) { console.log('Skipping: mistral key required'); process.exit(0) }
if (!process.env.DATABASE_URL) { console.log('Skipping: DATABASE_URL required'); process.exit(0) }


const model = 'mistral-small-latest'


function createClient() {
  config.model = model

  const providerClient = new Mistral({ apiKey })

  return supercompat({
    clientAdapter: mistralClientAdapter({ mistral: providerClient }),
    runAdapter: completionsRunAdapter(),
    storageAdapter: prismaStorageAdapter({ prisma: createTestPrisma() }),
  })
}

describe('Responses API: prisma + mistral', { concurrency: true, timeout: 60_000 }, () => {
  for (const [name, contract] of Object.entries(responsesContracts)) {
    test(name, { concurrency: true, timeout: 60_000 }, () => withRetry(() => contract(createClient()), { label: name }))
  }
})
