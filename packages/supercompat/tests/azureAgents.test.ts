import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import OpenAI from 'openai'
import dayjs from 'dayjs'
import { AIProjectClient } from '@azure/ai-projects'
import { ClientSecretCredential } from '@azure/identity'
import {
  azureAgentsRunAdapter,
  azureAiProjectClientAdapter,
  supercompat,
  azureAgentsStorageAdapter,
} from '../src/index'

const azureEndpoint = process.env.AZURE_PROJECT_ENDPOINT
const azureTenantId = process.env.AZURE_TENANT_ID
const azureClientId = process.env.AZURE_CLIENT_ID
const azureClientSecret = process.env.AZURE_CLIENT_SECRET
const azureAgentId = process.env.AZURE_AGENT_ID || 'asst_D1Ii6UTiucSRtzjzMdZabi3o'

if (!azureEndpoint || !azureTenantId || !azureClientId || !azureClientSecret) {
  console.error('Azure credentials not found in environment variables')
  process.exit(1)
}

const cred = new ClientSecretCredential(
  azureTenantId,
  azureClientId,
  azureClientSecret,
)

const azureAiProject = new AIProjectClient(azureEndpoint, cred)

test('azureAgentsRunAdapter can create thread, message, and run', async (t) => {
  const openaiAssistant = {
    id: 'azure-agent-assistant',
    object: 'assistant' as const,
    model: 'gpt-4',
    instructions: 'You are a concise, helpful assistant.',
    description: null,
    name: 'Azure Agent Assistant',
    metadata: {},
    tools: [],
    created_at: dayjs().unix(),
  }

  const client = supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: azureAgentsRunAdapter({
      azureAiProject,
      azureAgentId,
      getOpenaiAssistant: () => openaiAssistant,
    }),
    storage: azureAgentsStorageAdapter({ azureAiProject, azureAgentId }),
  })

  const thread = await client.beta.threads.create()
  assert.ok(thread.id, 'Thread should have an ID')

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is 2 + 2? Reply with just one number and nothing else.',
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: openaiAssistant.id,
  })

  assert.ok(run.id, 'Run should have an ID')
  assert.equal(run.status, 'completed', 'Run should be completed')

  const list = await client.beta.threads.messages.list(thread.id)
  const assistantMessage = list.data
    .filter((m) => m.role === 'assistant')
    .at(-1)

  assert.ok(assistantMessage, 'Should have an assistant message')
  const text = (
    assistantMessage?.content[0] as OpenAI.Beta.Threads.MessageContentText
  ).text.value.trim()
  assert.equal(text, '4', 'Assistant should respond with 4')
})

test('azureAgentsRunAdapter maintains conversation across runs', async (t) => {
  const openaiAssistant = {
    id: 'azure-agent-assistant',
    object: 'assistant' as const,
    model: 'gpt-4',
    instructions: 'You are a concise, helpful assistant.',
    description: null,
    name: 'Azure Agent Assistant',
    metadata: {},
    tools: [],
    created_at: dayjs().unix(),
  }

  const client = supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: azureAgentsRunAdapter({
      azureAiProject,
      azureAgentId,
      getOpenaiAssistant: () => openaiAssistant,
    }),
    storage: azureAgentsStorageAdapter({ azureAiProject, azureAgentId }),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'My favorite color is blue.',
  })

  await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: openaiAssistant.id,
  })

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is my favorite color?',
  })

  await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: openaiAssistant.id,
  })

  const list = await client.beta.threads.messages.list(thread.id)
  const assistantMessage = list.data
    .filter((m) => m.role === 'assistant')
    .at(-1)

  assert.ok(assistantMessage, 'Should have an assistant message')
  const text = (
    assistantMessage?.content[0] as OpenAI.Beta.Threads.MessageContentText
  ).text.value
    .trim()
    .toLowerCase()
  assert.ok(text.includes('blue'), `Response should mention blue, got: ${text}`)
})

test('azureAgentsStorageAdapter works with streaming', async (t) => {
  const openaiAssistant = {
    id: 'azure-agent-assistant',
    object: 'assistant' as const,
    model: 'gpt-4',
    instructions: 'You are a concise, helpful assistant.',
    description: null,
    name: 'Azure Agent Assistant',
    metadata: {},
    tools: [],
    created_at: dayjs().unix(),
  }

  const client = supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: azureAgentsRunAdapter({
      azureAiProject,
      azureAgentId,
      getOpenaiAssistant: () => openaiAssistant,
    }),
    storage: azureAgentsStorageAdapter({ azureAiProject, azureAgentId }),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Say hello in one short sentence.',
  })

  const run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: openaiAssistant.id,
    stream: true,
  })

  let sawCompleted = false
  for await (const event of run) {
    if (event.event === 'thread.run.completed') {
      sawCompleted = true
    }
  }
  assert.ok(sawCompleted, 'Run should complete')

  // Poll for the final assistant message
  let finalText = ''
  for (let i = 0; i < 20; i++) {
    const listAfter = await client.beta.threads.messages.list(thread.id)
    const finalAssistant = listAfter.data
      .filter((m) => m.role === 'assistant')
      .at(-1)

    const maybeText = (
      finalAssistant?.content?.[0] as
        | OpenAI.Beta.Threads.MessageContentText
        | undefined
    )?.text?.value

    if (typeof maybeText === 'string' && maybeText.trim().length > 0) {
      finalText = maybeText.trim().toLowerCase()
      break
    }

    await new Promise((r) => setTimeout(r, 200))
  }

  assert.ok(finalText.length > 0, 'Should receive a non-empty assistant reply')
  assert.ok(
    finalText.includes('hello') || finalText.includes('hi'),
    `Expected greeting, got: ${finalText}`,
  )
})

test('azureAgentsRunAdapter can retrieve run status', async (t) => {
  const openaiAssistant = {
    id: 'azure-agent-assistant',
    object: 'assistant' as const,
    model: 'gpt-4',
    instructions: 'You are a concise, helpful assistant.',
    description: null,
    name: 'Azure Agent Assistant',
    metadata: {},
    tools: [],
    created_at: dayjs().unix(),
  }

  const client = supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: azureAgentsRunAdapter({
      azureAiProject,
      azureAgentId,
      getOpenaiAssistant: () => openaiAssistant,
    }),
    storage: azureAgentsStorageAdapter({ azureAiProject, azureAgentId }),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is 1 + 1?',
  })

  const createdRun = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: openaiAssistant.id,
  })

  const retrievedRun = await client.beta.threads.runs.retrieve(
    createdRun.id,
    { thread_id: thread.id },
  )

  assert.equal(retrievedRun.id, createdRun.id, 'Run IDs should match')
  assert.equal(
    retrievedRun.status,
    'completed',
    'Retrieved run should be completed',
  )
})
