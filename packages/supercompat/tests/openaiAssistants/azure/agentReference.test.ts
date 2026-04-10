import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { post } from '../../../src/handlers/assistants/azureResponsesStorageAdapter/threads/runs/post'

test('Azure agent reference is included when assistant_id is provided', async () => {
  let capturedBody: any = null

  const mockClient = {} as any

  const mockRunAdapter = {
    getOpenaiAssistant: async () => ({
      id: 'test-agent-name',
      name: 'test-agent-name',
      model: 'gpt-4',
      instructions: 'Test instructions',
      tools: [],
    }),
    handleRun: async ({ body }: any) => {
      capturedBody = body
    },
  }

  const handler = post({
    client: mockClient,
    runAdapter: mockRunAdapter as any,
    createResponseItems: [],
  })

  await handler('https://api.openai.com/v1/threads/thread_123/runs', {
    method: 'POST',
    body: JSON.stringify({ assistant_id: 'test-agent-name', stream: false }),
  })

  assert.ok(capturedBody, 'Body should be passed to handleRun')
  assert.ok(capturedBody.agent, 'Agent should be present in body')
  assert.strictEqual(capturedBody.agent.name, 'test-agent-name')
  assert.strictEqual(capturedBody.agent.type, 'agent_reference')

  console.log('✅ Azure agent reference correctly included in response creation')
})

test('Azure agent reference is not included when assistant_id is missing', async () => {
  let capturedBody: any = null

  const mockRunAdapter = {
    getOpenaiAssistant: async () => ({
      id: 'asst_123',
      name: 'Test Assistant',
      model: 'gpt-4',
      instructions: 'Test instructions',
      tools: [],
    }),
    handleRun: async ({ body }: any) => {
      capturedBody = body
    },
  }

  const handler = post({
    client: {} as any,
    runAdapter: mockRunAdapter as any,
    createResponseItems: [],
  })

  await handler('https://api.openai.com/v1/threads/thread_123/runs', {
    method: 'POST',
    body: JSON.stringify({ stream: false }),
  })

  assert.ok(capturedBody, 'Body should be passed to handleRun')
  assert.ok(
    Object.prototype.hasOwnProperty.call(capturedBody, 'instructions'),
    'Instructions should be included when no agent ID is present'
  )

  console.log('✅ Azure agent reference correctly omitted when assistant_id is missing')
})

test('Azure agent reference resolves from assistant_id and omits instructions', async () => {
  let capturedBody: any = null

  const mockRunAdapter = {
    getOpenaiAssistant: async () => ({
      id: 'agent-name-from-request',
      name: 'agent-name-from-request',
      model: 'gpt-4',
      instructions: 'LOCAL_INSTRUCTIONS_SHOULD_NOT_BE_SENT',
      tools: [],
    }),
    handleRun: async ({ body }: any) => {
      capturedBody = body
    },
  }

  const handler = post({
    client: {} as any,
    runAdapter: mockRunAdapter as any,
    createResponseItems: [],
  })

  await handler('https://api.openai.com/v1/threads/thread_456/runs', {
    method: 'POST',
    body: JSON.stringify({ assistant_id: 'agent-name-from-request', stream: false }),
  })

  assert.ok(capturedBody?.agent, 'Agent should be present in body')
  assert.strictEqual(capturedBody.agent.name, 'agent-name-from-request')
  assert.ok(
    !Object.prototype.hasOwnProperty.call(capturedBody, 'instructions'),
    'Instructions should be omitted when agent is specified'
  )

  console.log('✅ assistant_id resolves agent reference and instructions are omitted')
})
