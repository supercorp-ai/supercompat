/**
 * Conformance: azureAgentsStorageAdapter + azureAgentsRunAdapter + Azure AI Project
 *
 * Creates real Azure agents for each test. Uses coreContracts since
 * the Azure Agents adapter doesn't implement full assistant CRUD (retrieve/update/delete/list).
 */
import { test, describe } from 'node:test'
import OpenAI from 'openai'
import dayjs from 'dayjs'
import { uid } from 'radash'
import { PrismaClient } from '@prisma/client'
import { AIProjectClient } from '@azure/ai-projects'
import { ClientSecretCredential } from '@azure/identity'
import { contracts as _allContracts } from '../contracts'

// createAndRunStream: Azure createThreadAndRun creates a non-streaming run,
// can't retroactively stream it through the run adapter
const { 'run: create and run stream': _, ...contracts } = _allContracts
import { config } from '../contracts/lib/config'
import {
  supercompat,
  azureAiProjectClientAdapter,
  azureAgentsRunAdapter,
  azureAgentsStorageAdapter,
} from '../../../src/openaiAssistants/index'

const endpoint = process.env.AZURE_PROJECT_ENDPOINT
const tenantId = process.env.AZURE_TENANT_ID
const clientId = process.env.AZURE_CLIENT_ID
const clientSecret = process.env.AZURE_CLIENT_SECRET

if (!endpoint || !tenantId || !clientId || !clientSecret) {
  console.log('Skipping: AZURE_PROJECT_ENDPOINT, AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET required')
  process.exit(0)
}
if (!process.env.DATABASE_URL) {
  console.log('Skipping: DATABASE_URL required')
  process.exit(0)
}

function createClient(): OpenAI {
  config.model = 'gpt-4.1-mini'
  const credential = new ClientSecretCredential(tenantId!, clientId!, clientSecret!)
  const azureAiProject = new AIProjectClient(endpoint!, credential)
  const prisma = new PrismaClient()

  const assistants = new Map<string, any>()
  let currentAssistant: any = {
    id: `asst_${uid(24)}`,
    object: 'assistant',
    model: config.model,
    instructions: '',
    description: null,
    name: null,
    metadata: {},
    tools: [],
    created_at: dayjs().unix(),
  }

  const client = supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: azureAgentsRunAdapter({ azureAiProject }),
    storage: azureAgentsStorageAdapter({ azureAiProject, prisma }),
  })

  const beta = client.beta as any

  beta.assistants.create = async (body: any) => {
    const agent = await azureAiProject.agents.createAgent(config.model, {
      name: body.name ?? 'test_' + uid(8),
      instructions: body.instructions ?? '',
      tools: body.tools ?? [],
      ...(body.tool_resources ? {
        toolResources: {
          ...(body.tool_resources.file_search ? {
            fileSearch: {
              vectorStoreIds: body.tool_resources.file_search.vector_store_ids || [],
            },
          } : {}),
          ...(body.tool_resources.code_interpreter ? {
            codeInterpreter: body.tool_resources.code_interpreter,
          } : {}),
        },
      } : {}),
    })
    const assistant = {
      id: agent.id,
      object: 'assistant',
      created_at: dayjs().unix(),
      model: config.model,
      name: agent.name ?? null,
      description: body.description ?? null,
      instructions: body.instructions ?? null,
      tools: body.tools ?? [],
      metadata: body.metadata ?? null,
      tool_resources: body.tool_resources ?? null,
    }
    assistants.set(assistant.id, assistant)
    currentAssistant = assistant
    return assistant
  }

  beta.assistants.retrieve = async (id: string) => {
    const a = assistants.get(id)
    if (!a) throw new Error(`Assistant ${id} not found`)
    return a
  }

  beta.assistants.update = async (id: string, body: any) => {
    const a = assistants.get(id)
    if (!a) throw new Error(`Assistant ${id} not found`)
    Object.assign(a, {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.instructions !== undefined && { instructions: body.instructions }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.model !== undefined && { model: body.model }),
      ...(body.tools !== undefined && { tools: body.tools }),
      ...(body.metadata !== undefined && { metadata: body.metadata }),
    })
    currentAssistant = a
    return a
  }

  beta.assistants.delete = async (id: string) => {
    try { await azureAiProject.agents.deleteAgent(id) } catch {}
    assistants.delete(id)
    return { id, deleted: true, object: 'assistant.deleted' }
  }

  beta.assistants.list = async () => ({
    data: Array.from(assistants.values()),
    has_more: false,
    first_id: Array.from(assistants.keys())[0] ?? null,
    last_id: Array.from(assistants.keys()).pop() ?? null,
    object: 'list',
  })

  return client
}

describe('azureAgentsStorageAdapter', { timeout: 600_000 }, () => {
  for (const [name, contract] of Object.entries(contracts)) {
    test(name, { timeout: 120_000 }, () => contract(createClient()))
  }
})
