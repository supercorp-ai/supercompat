/**
 * Conformance: runs core contracts against supercompat + openaiResponsesStorageAdapter.
 *
 * The Responses API doesn't have a native assistants concept, so assistant CRUD
 * contracts are skipped. Assistant create/retrieve/update/delete are handled
 * in-memory to support contracts that need an assistant for runs.
 */
import { test, describe } from 'node:test'
import OpenAI from 'openai'
import dayjs from 'dayjs'
import { uid } from 'radash'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { contracts as _allContracts } from '../contracts'

// Responses adapter limitations:
// - Deferred message storage: messages only sent to conversation when a run starts,
//   so standalone message CRUD (without a run) doesn't work
// - submitToolOutputsAndPoll: Responses API creates immutable responses, so polling
//   the original run ID after submitToolOutputs still shows requires_action
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
  openaiClientAdapter,
  openaiResponsesRunAdapter,
  openaiResponsesStorageAdapter,
} from '../../../src/openai/index'

const apiKey = process.env.TEST_OPENAI_API_KEY
if (!apiKey) {
  console.log('Skipping: TEST_OPENAI_API_KEY required')
  process.exit(0)
}

const proxyOpts = process.env.HTTPS_PROXY
  ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) as any }
  : {}

function createClient(): OpenAI {
  const realOpenAI = new OpenAI({ apiKey, ...proxyOpts })

  // In-memory assistant store
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
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: openaiResponsesRunAdapter({
      getOpenaiAssistant: () => currentAssistant,
    }),
    storage: openaiResponsesStorageAdapter(),
  })

  // Override assistant CRUD to work in-memory
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
    // Update current so runs use this assistant's config
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

describe('openaiResponsesStorageAdapter (deferItemCreationUntilRun: true)', { concurrency: true, timeout: 300_000 }, () => {
  for (const [name, contract] of Object.entries(coreContracts)) {
    test(name, { concurrency: true, timeout: 240_000 }, () => contract(createClient()))
  }
})

// Test message CRUD with deferItemCreationUntilRun: false
// Messages are created immediately, so retrieve/list should work
import { retrieveMessage } from '../contracts/crud'

function createImmediateClient(): OpenAI {
  const realOpenAI = new OpenAI({ apiKey, ...proxyOpts })
  const assistantId = `asst_${uid(24)}`
  const currentAssistant: any = {
    id: assistantId,
    object: 'assistant',
    model: 'gpt-4.1-mini',
    instructions: '',
    tools: [],
    metadata: {},
    created_at: dayjs().unix(),
  }

  return supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: openaiResponsesRunAdapter({
      getOpenaiAssistant: () => currentAssistant,
    }),
    storage: openaiResponsesStorageAdapter({ deferItemCreationUntilRun: false }),
  })
}

describe('openaiResponsesStorageAdapter (deferItemCreationUntilRun: false)', { concurrency: true, timeout: 240_000 }, () => {
  test('crud: retrieve message', { concurrency: true, timeout: 60_000 }, () => retrieveMessage(createImmediateClient()))
})
