import OpenAI from 'openai'
import { HttpsProxyAgent } from 'https-proxy-agent'

const proxyOpts = process.env.HTTPS_PROXY
  ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) as any }
  : {}

export function createBaselineClient(): OpenAI {
  const apiKey = process.env.TEST_OPENAI_API_KEY
  if (!apiKey) throw new Error('TEST_OPENAI_API_KEY required')
  return new OpenAI({ apiKey, ...proxyOpts })
}

export function createResponsesClient(): OpenAI {
  // Lazy imports to avoid pulling in supercompat when only running baseline
  const { supercompat, openaiClientAdapter, responsesRunAdapter, responsesStorageAdapter } =
    require('../../../../src/index')
  const dayjs = require('dayjs')

  const openai = createBaselineClient()

  // The responses adapter needs an assistant reference for getOpenaiAssistant
  // We'll set this up per-test via the returned client's _testAssistant property
  let currentAssistant: any = {
    id: 'pending',
    object: 'assistant',
    model: 'gpt-4.1-mini',
    instructions: '',
    description: null,
    name: 'Test',
    metadata: {},
    tools: [],
    created_at: dayjs().unix(),
  }

  const client = supercompat({
    client: openaiClientAdapter({ openai }),
    runAdapter: responsesRunAdapter({
      getOpenaiAssistant: () => currentAssistant,
    }),
    storage: responsesStorageAdapter(),
  })

  // Attach helper to update assistant context
  ;(client as any)._setAssistant = (assistant: any) => {
    currentAssistant = assistant
  }

  return client
}

export function createPrismaOpenAIClient(): OpenAI {
  const { supercompat, openaiClientAdapter, completionsRunAdapter, prismaStorageAdapter } =
    require('../../../../src/index')
  const { PrismaClient } = require('@prisma/client')

  const openai = createBaselineClient()
  const prisma = new PrismaClient()

  const client = supercompat({
    client: openaiClientAdapter({ openai }),
    runAdapter: completionsRunAdapter(),
    storage: prismaStorageAdapter({ prisma }),
  })

  ;(client as any)._prisma = prisma

  return client
}

export async function cleanup(client: OpenAI, ids: {
  assistantId?: string
  threadId?: string
}) {
  // Let fire-and-forget DB writes settle before deleting resources
  await new Promise((r) => setTimeout(r, 500))

  try {
    if (ids.threadId) await client.beta.threads.delete(ids.threadId)
  } catch {}
  try {
    if (ids.assistantId) await client.beta.assistants.delete(ids.assistantId)
  } catch {}
}
