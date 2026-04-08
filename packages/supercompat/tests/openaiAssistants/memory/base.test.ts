/**
 * Conformance: memoryStorageAdapter + completionsRunAdapter + OpenAI
 */
import { test, describe } from 'node:test'
import OpenAI from 'openai'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { completionsContracts } from '../contracts'
import { config } from '../contracts/lib/config'
import {
  supercompat,
  openaiClientAdapter,
  completionsRunAdapter,
  memoryStorageAdapter,
} from '../../../src/openai/index'

const apiKey = process.env.TEST_OPENAI_API_KEY
if (!apiKey) {
  console.log('Skipping: TEST_OPENAI_API_KEY required')
  process.exit(0)
}

const proxyOpts = process.env.HTTPS_PROXY
  ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) as any }
  : {}

async function createMemoryTestClient(): Promise<OpenAI> {
  config.model = 'gpt-4.1-mini'

  const client = supercompat({
    client: openaiClientAdapter({ openai: new OpenAI({ apiKey, ...proxyOpts }) }),
    runAdapter: completionsRunAdapter(),
    storage: memoryStorageAdapter(),
  })

  const beta = client.beta as any

  // Pre-create a default assistant
  const defaultAssistant = await beta.assistants.create({
    model: config.model,
    name: 'Default Test Assistant',
  })
  let lastAssistantId: string = defaultAssistant.id

  // Track last assistant ID
  const originalAssistantsCreate = beta.assistants.create.bind(beta.assistants)
  beta.assistants.create = async (body: any, ...args: any[]) => {
    const result = await originalAssistantsCreate(body, ...args)
    lastAssistantId = result.id
    return result
  }

  // Intercept threads.create to auto-inject assistantId
  const originalThreadsCreate = beta.threads.create.bind(beta.threads)
  beta.threads.create = async (body?: any, ...args: any[]) => {
    body = body || {}
    body.metadata = { ...body.metadata, assistantId: lastAssistantId }
    return originalThreadsCreate(body, ...args)
  }

  return client
}

describe('memoryStorageAdapter + OpenAI', { timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(completionsContracts)) {
    test(name, { timeout: 120_000 }, async () => contract(await createMemoryTestClient()))
  }
})
