/**
 * Conformance: azureResponsesStorageAdapter + openaiResponsesRunAdapter + Azure AI Project
 *
 * Uses v2 SDK for conversations + responses, v1 for the run adapter.
 * Assistant CRUD is in-memory (Azure Responses doesn't have native assistants).
 */
import { test, describe } from 'node:test'
import OpenAI from 'openai'
import dayjs from 'dayjs'
import { uid } from 'radash'
import { AIProjectClient } from '@azure/ai-projects-v2'
import { ClientSecretCredential } from '@azure/identity'
import { contracts as _allContracts } from '../contracts'

// Same exclusions as OpenAI responses adapter (deferred messages, immutable responses)
// plus file_search/code_interpreter (files.create not routed through Azure)
const exclude = new Set([
  // Deferred message storage
  'crud: create message', 'crud: retrieve message', 'crud: list messages',
  'crud: update message', 'crud: delete message',
  'data: message content preserved', 'data: list order desc', 'data: list order asc',
  'data: pagination with cursor',
  // submitToolOutputsAndPoll (immutable responses)
  'tools: round-trip poll', 'tools: parallel tool calls', 'tools: no-argument tool',
  'tools: complex arguments', 'tools: multiple rounds', 'data: special chars in tool output',
  // Missing handlers in responses adapter
  'run: runs list', 'run: create thread and run', 'run: create and run stream',
  'data: run step retrieve', 'data: run update',
  'data: pagination with before cursor',
])
const coreContracts = Object.fromEntries(
  Object.entries(_allContracts).filter(([name]) => !exclude.has(name))
)
import {
  supercompat,
  azureAiProjectClientAdapter,
  openaiResponsesRunAdapter,
  azureResponsesStorageAdapter,
} from '../../../src/openai/index'

const endpoint = process.env.AZURE_PROJECT_ENDPOINT
const tenantId = process.env.AZURE_TENANT_ID
const clientId = process.env.AZURE_CLIENT_ID
const clientSecret = process.env.AZURE_CLIENT_SECRET

if (!endpoint || !tenantId || !clientId || !clientSecret) {
  console.log('Skipping: AZURE_PROJECT_ENDPOINT, AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET required')
  process.exit(0)
}

function createClient(): OpenAI {
  const credential = new ClientSecretCredential(tenantId!, clientId!, clientSecret!)
  const azureAiProject = new AIProjectClient(endpoint!, credential)

  const assistants = new Map<string, any>()
  let currentAssistant: any = {
    id: `asst_${uid(24)}`,
    object: 'assistant',
    model: 'gpt-4.1-mini',
    instructions: '',
    description: null,
    name: null,
    metadata: {},
    tools: [],
    created_at: dayjs().unix(),
  }

  const client = supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: openaiResponsesRunAdapter({
      getOpenaiAssistant: () => currentAssistant,
    }),
    storage: azureResponsesStorageAdapter(),
  })

  const beta = client.beta as any

  beta.assistants.create = async (body: any) => {
    const assistant = {
      id: `asst_${uid(24)}`,
      object: 'assistant',
      created_at: dayjs().unix(),
      model: body.model,
      name: body.name ?? null,
      description: body.description ?? null,
      instructions: body.instructions ?? null,
      tools: body.tools ?? [],
      metadata: body.metadata ?? null,
      temperature: body.temperature ?? null,
      top_p: body.top_p ?? null,
      response_format: body.response_format ?? null,
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

describe('azureResponsesStorageAdapter', { concurrency: true, timeout: 300_000 }, () => {
  for (const [name, contract] of Object.entries(coreContracts)) {
    test(name, { concurrency: true, timeout: 120_000 }, () => contract(createClient()))
  }
})
