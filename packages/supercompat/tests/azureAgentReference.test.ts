import { test } from 'node:test'
import { strict as assert } from 'node:assert'

test('Azure agent reference is included when assistant_id is provided', async () => {
  // Mock OpenAI client
  let capturedOptions: any = null
  let capturedParams: any = null

  const mockClient = {
    responses: {
      create: async (params: any, options?: any) => {
        capturedParams = params
        capturedOptions = options
        return {
          id: 'response_123',
          object: 'response',
          conversation: { id: 'conv_123' },
          status: 'completed',
          output: [],
          created_at: Math.floor(Date.now() / 1000),
          usage: null,
          metadata: {},
        }
      },
    },
  }

  // Mock runAdapter with Azure agent
  const mockRunAdapter = {
    getOpenaiAssistant: async () => ({
      id: 'test-agent-name',
      name: 'test-agent-name',
      model: 'gpt-4',
      instructions: 'Test instructions',
      tools: [],
    }),
    handleRun: async () => {},
  }

  // Import and call the Azure post handler
  const { post } = await import('../src/adapters/storage/azureResponsesStorageAdapter/threads/runs/post')

  const handler = post({
    client: mockClient as any,
    runAdapter: mockRunAdapter as any,
    createResponseItems: [],
  })

  const mockUrl = 'https://api.openai.com/v1/threads/thread_123/runs'
  const mockOptions = {
    method: 'POST',
    body: JSON.stringify({
      assistant_id: 'test-agent-name',
      stream: false,
    }),
  }

  await handler(mockUrl, mockOptions)

  // Verify agent reference was passed
  assert.ok(capturedParams, 'Params should be passed to responses.create')
  assert.ok(capturedParams.agent, 'Agent should be present in params')
  assert.strictEqual(
    capturedParams.agent.name,
    'test-agent-name',
    'Agent name should match assistant_id'
  )
  assert.strictEqual(
    capturedParams.agent.type,
    'agent_reference',
    'Agent type should be agent_reference'
  )
  assert.strictEqual(
    capturedOptions,
    undefined,
    'Options should be undefined when agent is in params'
  )

  console.log('✅ Azure agent reference correctly included in response creation')
})

test('Azure agent reference is not included when assistant_id is missing', async () => {
  // Mock OpenAI client
  let capturedOptions: any = null
  let capturedParams: any = null

  const mockClient = {
    responses: {
      create: async (params: any, options?: any) => {
        capturedParams = params
        capturedOptions = options
        return {
          id: 'response_123',
          object: 'response',
          conversation: { id: 'conv_123' },
          status: 'completed',
          output: [],
          created_at: Math.floor(Date.now() / 1000),
          usage: null,
          metadata: {},
        }
      },
    },
  }

  // Mock runAdapter WITHOUT Azure agent
  const mockRunAdapter = {
    getOpenaiAssistant: async () => ({
      id: 'asst_123',
      name: 'Test Assistant',
      model: 'gpt-4',
      instructions: 'Test instructions',
      tools: [],
    }),
    handleRun: async () => {},
  }

  // Import and call the Azure post handler
  const { post } = await import('../src/adapters/storage/azureResponsesStorageAdapter/threads/runs/post')

  const handler = post({
    client: mockClient as any,
    runAdapter: mockRunAdapter as any,
    createResponseItems: [],
  })

  const mockUrl = 'https://api.openai.com/v1/threads/thread_123/runs'
  const mockOptions = {
    method: 'POST',
    body: JSON.stringify({
      stream: false,
    }),
  }

  await handler(mockUrl, mockOptions)

  // Verify agent reference was NOT passed (should be undefined)
  assert.strictEqual(
    capturedOptions,
    undefined,
    'Options should be undefined when no agent ID present'
  )
  assert.ok(
    Object.prototype.hasOwnProperty.call(capturedParams, 'instructions'),
    'Instructions should be included when no agent ID is present'
  )

  console.log('✅ Azure agent reference correctly omitted when assistant_id is missing')
})

test('Azure agent reference resolves from assistant_id and omits instructions', async () => {
  let capturedOptions: any = null
  let capturedParams: any = null

  const mockClient = {
    responses: {
      create: async (params: any, options?: any) => {
        capturedParams = params
        capturedOptions = options
        return {
          id: 'response_456',
          object: 'response',
          conversation: { id: 'conv_456' },
          status: 'completed',
          output: [],
          created_at: Math.floor(Date.now() / 1000),
          usage: null,
          metadata: {},
        }
      },
    },
  }

  const mockRunAdapter = {
    getOpenaiAssistant: async () => ({
      id: 'agent-name-from-request',
      name: 'agent-name-from-request',
      model: 'gpt-4',
      instructions: 'LOCAL_INSTRUCTIONS_SHOULD_NOT_BE_SENT',
      tools: [],
    }),
    handleRun: async () => {},
  }

  const { post } = await import('../src/adapters/storage/azureResponsesStorageAdapter/threads/runs/post')

  const handler = post({
    client: mockClient as any,
    runAdapter: mockRunAdapter as any,
    createResponseItems: [],
  })

  const mockUrl = 'https://api.openai.com/v1/threads/thread_456/runs'
  const mockOptions = {
    method: 'POST',
    body: JSON.stringify({
      assistant_id: 'agent-name-from-request',
      stream: false,
    }),
  }

  await handler(mockUrl, mockOptions)

  assert.ok(capturedParams?.agent, 'Agent should be present in params')
  assert.strictEqual(
    capturedParams.agent.name,
    'agent-name-from-request',
    'Agent name should use assistant_id when provided'
  )
  assert.ok(
    !Object.prototype.hasOwnProperty.call(capturedParams, 'instructions'),
    'Instructions should be omitted when agent is specified'
  )

  console.log('✅ assistant_id resolves agent reference and instructions are omitted')
})
