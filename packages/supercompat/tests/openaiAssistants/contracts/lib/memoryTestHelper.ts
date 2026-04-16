/**
 * Shared helper for memory-based conformance tests.
 * Mirrors prismaTestHelper but uses memoryStorageAdapter instead of Prisma.
 */
import OpenAI from 'openai'
import {
  supercompat,
  completionsRunAdapter,
  memoryStorageAdapter,
} from '../../../../src/openai/index'
import { config } from './config'

export async function createMemoryTestClient({
  clientAdapter,
  model,
  runAdapter,
}: {
  clientAdapter: any
  model: string
  runAdapter?: any
}): Promise<OpenAI> {
  config.model = model

  const client = supercompat({
    clientAdapter: clientAdapter,
    runAdapter: runAdapter ?? completionsRunAdapter(),
    storageAdapter: memoryStorageAdapter(),
  })

  const beta = client.beta as any

  // Pre-create a default assistant so contracts that create threads before assistants work.
  const defaultAssistant = await beta.assistants.create({
    model,
    name: 'Default Test Assistant',
  })
  let lastAssistantId: string = defaultAssistant.id

  // Track last assistant ID for thread metadata injection
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
