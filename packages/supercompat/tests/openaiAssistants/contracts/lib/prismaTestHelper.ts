/**
 * Shared helper for prisma-based conformance tests.
 * Handles:
 * - Setting the model in shared config
 * - Auto-injecting assistantId into thread metadata
 * - Pre-creating a default assistant
 * - Optional custom run adapter (defaults to completionsRunAdapter)
 */
import OpenAI from 'openai'
import { PrismaClient } from '@prisma/client'
import {
  supercompat,
  completionsRunAdapter,
  prismaStorageAdapter,
} from '../../../../src/openai/index'
import { config } from './config'

export async function createPrismaTestClient({
  clientAdapter,
  model,
  runAdapter,
}: {
  clientAdapter: any
  model: string
  runAdapter?: any
}): Promise<OpenAI> {
  config.model = model

  const prisma = new PrismaClient()

  const client = supercompat({
    client: clientAdapter,
    runAdapter: runAdapter ?? completionsRunAdapter(),
    storage: prismaStorageAdapter({ prisma }),
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
