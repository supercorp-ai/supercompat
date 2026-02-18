import { test, after } from 'node:test'
import { strict as assert } from 'node:assert'
import { AIProjectClient } from '@azure/ai-projects-v2'
import { ClientSecretCredential } from '@azure/identity'
import {
  azureAiProjectClientAdapter,
  azureResponsesStorageAdapter,
  responsesRunAdapter,
  supercompat,
} from '../src/index'

const azureEndpoint = process.env.AZURE_PROJECT_ENDPOINT
const azureTenantId = process.env.AZURE_TENANT_ID
const azureClientId = process.env.AZURE_CLIENT_ID
const azureClientSecret = process.env.AZURE_CLIENT_SECRET

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

test('azureResponses: create thread with array content', async () => {
  console.log('Testing Azure Responses thread creation with array content...')

  // Create a mock assistant for the runAdapter
  const mockAssistant = {
    id: 'test-assistant-id',
    object: 'assistant' as const,
    created_at: Date.now(),
    name: 'Test Assistant',
    description: null,
    model: 'gpt-4.1',
    instructions: 'You are a test assistant',
    tools: [],
    tool_resources: {},
    metadata: {},
    temperature: 1,
    top_p: 1,
    response_format: 'auto' as const,
  }

  // Create supercompat client with Azure Responses storage adapter
  const client = supercompat({
    client: azureAiProjectClientAdapter({
      azureAiProject,
    }),
    storage: azureResponsesStorageAdapter(),
    runAdapter: responsesRunAdapter({
      getOpenaiAssistant: async () => mockAssistant,
    }),
  })

  // Create thread with message that has array content (common format from UI)
  const thread = await client.beta.threads.create({
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Hello! This is a test message with array content.',
          },
        ],
      },
    ],
  })

  console.log('Thread created:', thread.id)

  // Verify thread was created
  assert.ok(thread.id, 'Thread should have an id')
  assert.strictEqual(thread.object, 'thread', 'Object should be "thread"')

  console.log('Successfully created thread with array content')

  // Clean up - delete the thread
  try {
    await client.beta.threads.del(thread.id)
    console.log('Thread deleted successfully')
  } catch (error) {
    console.log('Note: Could not delete thread (expected if delete not implemented)')
  }
})

test('azureResponses: create thread with string content', async () => {
  console.log('Testing Azure Responses thread creation with string content...')

  const mockAssistant = {
    id: 'test-assistant-id',
    object: 'assistant' as const,
    created_at: Date.now(),
    name: 'Test Assistant',
    description: null,
    model: 'gpt-4.1',
    instructions: 'You are a test assistant',
    tools: [],
    tool_resources: {},
    metadata: {},
    temperature: 1,
    top_p: 1,
    response_format: 'auto' as const,
  }

  const client = supercompat({
    client: azureAiProjectClientAdapter({
      azureAiProject,
    }),
    storage: azureResponsesStorageAdapter(),
    runAdapter: responsesRunAdapter({
      getOpenaiAssistant: async () => mockAssistant,
    }),
  })

  // Create thread with message that has string content
  const thread = await client.beta.threads.create({
    messages: [
      {
        role: 'user',
        content: 'Hello! This is a test message with string content.',
      },
    ],
  })

  console.log('Thread created:', thread.id)

  // Verify thread was created
  assert.ok(thread.id, 'Thread should have an id')
  assert.strictEqual(thread.object, 'thread', 'Object should be "thread"')

  console.log('Successfully created thread with string content')

  // Clean up
  try {
    await client.beta.threads.del(thread.id)
    console.log('Thread deleted successfully')
  } catch (error) {
    console.log('Note: Could not delete thread (expected if delete not implemented)')
  }
})

test('azureResponses: create thread with mixed content (text + image)', async () => {
  console.log('Testing Azure Responses thread creation with mixed content...')

  const mockAssistant = {
    id: 'test-assistant-id',
    object: 'assistant' as const,
    created_at: Date.now(),
    name: 'Test Assistant',
    description: null,
    model: 'gpt-4.1',
    instructions: 'You are a test assistant',
    tools: [],
    tool_resources: {},
    metadata: {},
    temperature: 1,
    top_p: 1,
    response_format: 'auto' as const,
  }

  const client = supercompat({
    client: azureAiProjectClientAdapter({
      azureAiProject,
    }),
    storage: azureResponsesStorageAdapter(),
    runAdapter: responsesRunAdapter({
      getOpenaiAssistant: async () => mockAssistant,
    }),
  })

  // Create thread with mixed content (text + image_url)
  const thread = await client.beta.threads.create({
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What is in this image?',
          },
          {
            type: 'image_url',
            image_url: {
              url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/320px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg',
              detail: 'auto',
            },
          },
        ],
      },
    ],
  })

  console.log('Thread created:', thread.id)

  // Verify thread was created
  assert.ok(thread.id, 'Thread should have an id')
  assert.strictEqual(thread.object, 'thread', 'Object should be "thread"')

  console.log('Successfully created thread with mixed content (text + image)')

  // Clean up
  try {
    await client.beta.threads.del(thread.id)
  } catch (error) {
    console.log('Note: Could not delete thread (expected if delete not implemented)')
  }
})

test('azureResponses: create thread with multiple text parts', async () => {
  console.log('Testing Azure Responses thread creation with multiple text parts...')

  const mockAssistant = {
    id: 'test-assistant-id',
    object: 'assistant' as const,
    created_at: Date.now(),
    name: 'Test Assistant',
    description: null,
    model: 'gpt-4.1',
    instructions: 'You are a test assistant',
    tools: [],
    tool_resources: {},
    metadata: {},
    temperature: 1,
    top_p: 1,
    response_format: 'auto' as const,
  }

  const client = supercompat({
    client: azureAiProjectClientAdapter({
      azureAiProject,
    }),
    storage: azureResponsesStorageAdapter(),
    runAdapter: responsesRunAdapter({
      getOpenaiAssistant: async () => mockAssistant,
    }),
  })

  // Create thread with multiple text content parts
  const thread = await client.beta.threads.create({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello! ' },
          { type: 'text', text: 'How are you? ' },
          { type: 'text', text: 'This is a multi-part message.' },
        ],
      },
    ],
  })

  console.log('Thread created:', thread.id)

  // Verify thread was created
  assert.ok(thread.id, 'Thread should have an id')
  assert.strictEqual(thread.object, 'thread', 'Object should be "thread"')

  console.log('Successfully created thread with multiple text parts')

  // Clean up
  try {
    await client.beta.threads.del(thread.id)
  } catch (error) {
    console.log('Note: Could not delete thread (expected if delete not implemented)')
  }
})

test('azureResponses: retrieve messages from thread', async () => {
  console.log('Testing Azure Responses message retrieval...')

  const mockAssistant = {
    id: 'test-assistant-id',
    object: 'assistant' as const,
    created_at: Date.now(),
    name: 'Test Assistant',
    description: null,
    model: 'gpt-4.1',
    instructions: 'You are a test assistant',
    tools: [],
    tool_resources: {},
    metadata: {},
    temperature: 1,
    top_p: 1,
    response_format: 'auto' as const,
  }

  const client = supercompat({
    client: azureAiProjectClientAdapter({
      azureAiProject,
    }),
    storage: azureResponsesStorageAdapter(),
    runAdapter: responsesRunAdapter({
      getOpenaiAssistant: async () => mockAssistant,
    }),
  })

  // Create thread with a message
  const thread = await client.beta.threads.create({
    messages: [
      {
        role: 'user',
        content: 'Hello! This is a test message.',
      },
    ],
  })

  console.log('Thread created:', thread.id)

  // Retrieve messages
  const messages = await client.beta.threads.messages.list(thread.id)
  console.log('Retrieved messages:', messages.data.length)

  // Verify we got the message
  assert.ok(messages.data.length > 0, 'Should have at least one message')
  assert.strictEqual(messages.data[0].role, 'user', 'Message should be from user')

  console.log('Successfully retrieved messages from thread')

  // Clean up
  try {
    await client.beta.threads.del(thread.id)
  } catch (error) {
    console.log('Note: Could not delete thread (expected if delete not implemented)')
  }
})
