import { test, after } from 'node:test'
import { strict as assert } from 'node:assert'
import OpenAI from 'openai'
import { AIProjectClient } from '@azure/ai-projects-v2'
import { ClientSecretCredential } from '@azure/identity'
import dayjs from 'dayjs'
import {
  supercompat,
  responsesRunAdapter,
  azureResponsesStorageAdapter,
  azureAiProjectClientAdapter,
} from '../src/index'

// Skip slow tests if SKIP_SLOW_TESTS is set
const shouldSkipSlowTests = process.env.SKIP_SLOW_TESTS === 'true'
const testOrSkip = shouldSkipSlowTests ? test.skip : test

const azureEndpoint = process.env.AZURE_PROJECT_ENDPOINT
const azureTenantId = process.env.AZURE_TENANT_ID
const azureClientId = process.env.AZURE_CLIENT_ID
const azureClientSecret = process.env.AZURE_CLIENT_SECRET
const azureDeploymentName = process.env.AZURE_AI_DEPLOYMENT_NAME || 'gpt-4.1'

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

// Unref Azure SDK's MSAL timer handles so the test runner can proceed
after(() => {
  for (const h of (process as any)._getActiveHandles?.() ?? []) {
    if (h?.constructor?.name === 'Timeout' && typeof h.unref === 'function') {
      h.unref()
    }
  }
})

testOrSkip('Azure Responses API - basic conversation', async (t) => {
  console.log('Testing Azure Responses API with basic conversation...')

  // Get OpenAI-compatible client from Azure AI Project
  const openAIClient = await azureAiProject.getOpenAIClient()

  console.log('Azure client baseURL:', (openAIClient as any).baseURL)
  console.log('Azure client hasAPIKey:', !!(openAIClient as any).apiKey)

  // Create an agent in the Project
  const agent = await azureAiProject.agents.createVersion('test-responses-basic', {
    kind: 'prompt',
    model: azureDeploymentName,
    instructions: 'You are a helpful assistant that answers questions concisely',
  })

  console.log(`Created agent: ${agent.name}`)

  try {
    const openaiAssistant = {
      id: agent.name,
      object: 'assistant' as const,
      model: azureDeploymentName,
      instructions: agent.instructions || 'You are a helpful assistant',
      description: null,
      name: agent.name,
      metadata: {},
      tools: [],
      created_at: dayjs().unix(),
    }

    // Use supercompat with responses adapters
    const client = supercompat({
      client: azureAiProjectClientAdapter({ azureAiProject }),
      runAdapter: responsesRunAdapter({
        getOpenaiAssistant: () => openaiAssistant,
      }),
      storage: azureResponsesStorageAdapter(),
    })

    const thread = await client.beta.threads.create()
    assert.ok(thread.id, 'Thread should have an ID')

    await client.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: 'What is 2 + 2? Reply with just one number and nothing else.',
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
    ).text.value.trim()

    assert.equal(text, '4', `Expected '4', got '${text}'`)
    console.log('✅ Azure Responses API basic conversation test passed')
  } finally {
    // Cleanup
    await azureAiProject.agents.deleteVersion(agent.name, agent.version)
    console.log(`Deleted agent: ${agent.name}`)
  }
})

testOrSkip('Azure Responses API - maintains conversation across runs', async (t) => {
  console.log('Testing Azure Responses API conversation memory...')

  const openAIClient = await azureAiProject.getOpenAIClient()

  const agent = await azureAiProject.agents.createVersion('test-responses-memory', {
    kind: 'prompt',
    model: azureDeploymentName,
    instructions: 'You are a helpful assistant that remembers conversation context',
  })

  console.log(`Created agent: ${agent.name}`)

  try {
    const openaiAssistant = {
      id: agent.name,
      object: 'assistant' as const,
      model: azureDeploymentName,
      instructions: agent.instructions || 'You are a helpful assistant',
      description: null,
      name: agent.name,
      metadata: {},
      tools: [],
      created_at: dayjs().unix(),
    }

    const client = supercompat({
      client: azureAiProjectClientAdapter({ azureAiProject }),
      runAdapter: responsesRunAdapter({
        getOpenaiAssistant: () => openaiAssistant,
      }),
      storage: azureResponsesStorageAdapter(),
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

    assert.ok(text.includes('blue'), `Expected response to mention 'blue', got: ${text}`)
    console.log('✅ Azure Responses API conversation memory test passed')
  } finally {
    await azureAiProject.agents.deleteVersion(agent.name, agent.version)
    console.log(`Deleted agent: ${agent.name}`)
  }
})

test('Azure Responses API - streaming', async (t) => {
  console.log('Testing Azure Responses API with streaming...')

  const openAIClient = await azureAiProject.getOpenAIClient()

  const agent = await azureAiProject.agents.createVersion('test-responses-stream', {
    kind: 'prompt',
    model: azureDeploymentName,
    instructions: 'You are a helpful assistant',
  })

  console.log(`Created agent: ${agent.name}`)

  try {
    const openaiAssistant = {
      id: agent.name,
      object: 'assistant' as const,
      model: azureDeploymentName,
      instructions: agent.instructions || 'You are a helpful assistant',
      description: null,
      name: agent.name,
      metadata: {},
      tools: [],
      created_at: dayjs().unix(),
    }

    const client = supercompat({
      client: azureAiProjectClientAdapter({ azureAiProject }),
      runAdapter: responsesRunAdapter({
        getOpenaiAssistant: () => openaiAssistant,
      }),
      storage: azureResponsesStorageAdapter(),
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
        finalAssistant?.content?.[0] as OpenAI.Beta.Threads.MessageContentText | undefined
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
    console.log('✅ Azure Responses API streaming test passed')
  } finally {
    await azureAiProject.agents.deleteVersion(agent.name, agent.version)
    console.log(`Deleted agent: ${agent.name}`)
  }
})
