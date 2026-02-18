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

const createTestAgent = async ({
  namePrefix,
  instructions,
}: {
  namePrefix: string
  instructions: string
}) => {
  const suffix = Math.random().toString(36).slice(2, 8)
  return azureAiProject.agents.createVersion(`${namePrefix}-${suffix}`, {
    kind: 'prompt',
    model: azureDeploymentName,
    instructions,
  })
}

test('azureResponses: responses.retrieve() is intercepted and works', async () => {
  console.log('Testing responses.retrieve() interception...')

  const agent = await createTestAgent({
    namePrefix: 'test-supercompat-responses-retrieve',
    instructions: 'You are a test assistant.',
  })

  const client = supercompat({
    client: azureAiProjectClientAdapter({
      azureAiProject,
    }),
    storage: azureResponsesStorageAdapter(),
    runAdapter: responsesRunAdapter({
      getOpenaiAssistant: async () => ({
        id: 'local-assistant',
        object: 'assistant' as const,
        created_at: Date.now(),
        name: 'Test Assistant',
        description: null,
        model: azureDeploymentName,
        instructions: 'You are a test assistant',
        tools: [],
        tool_resources: {},
        metadata: {},
        temperature: 1,
        top_p: 1,
        response_format: 'auto' as const,
      }),
    }),
  })

  try {
    // Create thread and add message
    const thread = await client.beta.threads.create({
      messages: [
        {
          role: 'user',
          content: 'Test message',
        },
      ],
    })

    console.log('Thread created:', thread.id)

    // Create a run to generate a response
    const run = await client.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: agent.name,
      model: azureDeploymentName,
      instructions: 'Say "Hello test"',
    })

    console.log('Run completed:', run.id, 'status:', run.status)

    // Now retrieve messages - this should call responses.retrieve() internally
    console.log('Retrieving messages (this calls responses.retrieve() internally)...')
    const messages = await client.beta.threads.messages.list(thread.id)

    console.log('Retrieved messages:', messages.data.length)
    console.log('Message roles:', messages.data.map(m => m.role).join(', '))

    // Verify we got messages
    assert.ok(messages.data.length >= 2, 'Should have at least 2 messages (user + assistant)')

    const assistantMessage = messages.data.find(m => m.role === 'assistant')
    assert.ok(assistantMessage, 'Should have an assistant message')

    console.log('✅ responses.retrieve() was successfully intercepted and worked!')

    // Clean up thread
    try {
      await client.beta.threads.del(thread.id)
    } catch (error) {
      console.log('Note: Could not delete thread (expected if delete not implemented)')
    }
  } catch (error) {
    throw error
  } finally {
    await azureAiProject.agents.deleteVersion(agent.name, agent.version)
  }
})

test('azureResponses: direct responses.retrieve() call works', async () => {
  console.log('Testing direct responses.retrieve() call...')

  const agent = await createTestAgent({
    namePrefix: 'test-supercompat-responses-retrieve-direct',
    instructions: 'You are a test assistant.',
  })

  const client = supercompat({
    client: azureAiProjectClientAdapter({
      azureAiProject,
    }),
    storage: azureResponsesStorageAdapter(),
    runAdapter: responsesRunAdapter({
      getOpenaiAssistant: async () => ({
        id: 'local-assistant',
        object: 'assistant' as const,
        created_at: Date.now(),
        name: 'Test Assistant',
        description: null,
        model: azureDeploymentName,
        instructions: 'You are a test assistant',
        tools: [],
        tool_resources: {},
        metadata: {},
        temperature: 1,
        top_p: 1,
        response_format: 'auto' as const,
      }),
    }),
  })

  try {
    // Create thread and run
    const thread = await client.beta.threads.create({
      messages: [
        {
          role: 'user',
          content: 'Hello',
        },
      ],
    })

    const run = await client.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: agent.name,
      model: azureDeploymentName,
      instructions: 'Reply with "Hi"',
    })

    console.log('Run ID:', run.id)

    // Try to retrieve the response directly
    console.log('Calling responses.retrieve() directly...')

    try {
      const response = await client.responses.retrieve(run.id)
      console.log('✅ Direct responses.retrieve() succeeded')
      console.log('Response ID:', response.id)
      console.log('Response status:', response.status)
      assert.ok(response.id, 'Response should have an ID')
    } catch (error: any) {
      console.error('❌ Direct responses.retrieve() failed:', error.message)
      console.error('Error status:', error.status)
      console.error('Error code:', error.code)
      throw error
    }

    // Clean up thread
    try {
      await client.beta.threads.del(thread.id)
    } catch (error) {
      console.log('Note: Could not delete thread')
    }
  } catch (error) {
    throw error
  } finally {
    await azureAiProject.agents.deleteVersion(agent.name, agent.version)
  }
})
