import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import OpenAI from 'openai'
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

// You need to create these agents in Azure AI Studio
const SIMPLE_AGENT_ID = process.env.AZURE_AGENT_ID || 'asst_D1Ii6UTiucSRtzjzMdZabi3o'
const FUNCTION_AGENT_ID = process.env.AZURE_FUNCTION_AGENT_ID || SIMPLE_AGENT_ID
const CODE_INTERPRETER_AGENT_ID = process.env.AZURE_CODE_INTERPRETER_AGENT_ID || SIMPLE_AGENT_ID

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

test('azureAgentsRunAdapter can create thread, message, and run with simple agent', async (t) => {
  const client = supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: azureAgentsRunAdapter({
      azureAiProject,
    }),
    storage: azureAgentsStorageAdapter({ azureAiProject }),
  })

  // In Azure Agents, the assistant is pre-configured in Azure
  // We just need to reference it by ID when creating runs
  console.log(`Using Azure Agent: ${SIMPLE_AGENT_ID}`)

  const thread = await client.beta.threads.create()
  assert.ok(thread.id, 'Thread should have an ID')

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is 2 + 2? Reply with just the number.',
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: SIMPLE_AGENT_ID, // Pass Azure agent ID as assistant_id
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
  assert.ok(text.includes('4'), `Assistant should respond with 4, got: ${text}`)
})

test('azureAgentsRunAdapter maintains conversation across runs', async (t) => {
  const client = supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: azureAgentsRunAdapter({
      azureAiProject,
    }),
    storage: azureAgentsStorageAdapter({ azureAiProject }),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'My favorite color is blue.',
  })

  await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: SIMPLE_AGENT_ID,
  })

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is my favorite color?',
  })

  await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: SIMPLE_AGENT_ID,
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
  const client = supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: azureAgentsRunAdapter({
      azureAiProject,
    }),
    storage: azureAgentsStorageAdapter({ azureAiProject }),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Say hello in one short sentence.',
  })

  const run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: SIMPLE_AGENT_ID,
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
  const client = supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: azureAgentsRunAdapter({
      azureAiProject,
    }),
    storage: azureAgentsStorageAdapter({ azureAiProject }),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is 1 + 1?',
  })

  const createdRun = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: SIMPLE_AGENT_ID,
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

test('azureAgentsRunAdapter handles function calls', async (t) => {
  const client = supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: azureAgentsRunAdapter({
      azureAiProject,
    }),
    storage: azureAgentsStorageAdapter({
      azureAiProject,
    }),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is the weather in San Francisco?',
  })

  // Use the agent's configured tools (don't override)
  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: FUNCTION_AGENT_ID,
  })

  // If Azure agent has functions defined, it should require action
  if (run.status === 'requires_action') {
    assert.ok(run.required_action, 'Should have required action')
    assert.equal(
      run.required_action?.type,
      'submit_tool_outputs',
      'Should require tool outputs',
    )

    const toolCalls = run.required_action?.submit_tool_outputs.tool_calls
    assert.ok(toolCalls && toolCalls.length > 0, 'Should have tool calls')

    const toolCall = toolCalls[0]
    assert.equal(toolCall.type, 'function', 'Should be a function call')
    assert.ok(
      toolCall.function.name === 'get_weather' ||
        toolCall.function.name.includes('weather'),
      `Should call weather function, got: ${toolCall.function.name}`,
    )

    // Submit tool output
    const completedRun = await client.beta.threads.runs.submitToolOutputsAndPoll(
      thread.id,
      run.id,
      {
        tool_outputs: [
          {
            tool_call_id: toolCall.id,
            output: JSON.stringify({ temperature: 72, condition: 'sunny' }),
          },
        ],
      },
    )

    assert.equal(
      completedRun.status,
      'completed',
      'Run should complete after tool outputs',
    )

    const messages = await client.beta.threads.messages.list(thread.id)
    const finalMessage = messages.data.filter((m) => m.role === 'assistant').at(-1)
    assert.ok(finalMessage, 'Should have final assistant message')
  } else {
    // Agent might not have functions configured, just verify it completed
    assert.equal(run.status, 'completed', 'Run should complete')
  }
})

test('azureAgentsRunAdapter handles code interpreter', async (t) => {
  const client = supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: azureAgentsRunAdapter({
      azureAiProject,
    }),
    storage: azureAgentsStorageAdapter({
      azureAiProject,
    }),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Calculate the sum of numbers from 1 to 100.',
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: CODE_INTERPRETER_AGENT_ID,
    tools: [{ type: 'code_interpreter' }],
  })

  assert.equal(run.status, 'completed', 'Run should complete')

  const messages = await client.beta.threads.messages.list(thread.id)
  const assistantMessage = messages.data
    .filter((m) => m.role === 'assistant')
    .at(-1)

  assert.ok(assistantMessage, 'Should have an assistant message')
  const text = (
    assistantMessage?.content[0] as OpenAI.Beta.Threads.MessageContentText
  ).text.value
    .trim()
    .toLowerCase()

  // The sum of 1 to 100 is 5050
  assert.ok(
    text.includes('5050') || text.includes('5,050'),
    `Response should include 5050, got: ${text}`,
  )
})

test('azureAgentsRunAdapter uses Azure agent config when no overrides provided', async (t) => {
  // This test verifies that when we don't pass tools or instructions in createAndPoll,
  // the Azure agent's own configuration is used
  const client = supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: azureAgentsRunAdapter({
      azureAiProject,
    }),
    storage: azureAgentsStorageAdapter({ azureAiProject }),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is 3 + 3? Reply with just the number.',
  })

  // Create run without passing any tools or instructions
  // This should use whatever is configured in the Azure agent
  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: SIMPLE_AGENT_ID,
  })

  assert.equal(run.status, 'completed', 'Run should complete')

  const messages = await client.beta.threads.messages.list(thread.id)
  const assistantMessage = messages.data
    .filter((m) => m.role === 'assistant')
    .at(-1)

  assert.ok(assistantMessage, 'Should have an assistant message')
  const text = (
    assistantMessage?.content[0] as OpenAI.Beta.Threads.MessageContentText
  ).text.value.trim()
  assert.ok(text.includes('6'), `Assistant should respond with 6, got: ${text}`)
})

test('azureAgentsRunAdapter allows overriding instructions in run', async (t) => {
  // This test verifies that we can override the Azure agent's instructions
  // by passing instructions in the createAndPoll call
  const client = supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: azureAgentsRunAdapter({
      azureAiProject,
    }),
    storage: azureAgentsStorageAdapter({ azureAiProject }),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Tell me a number.',
  })

  // Override the agent's instructions with custom instructions
  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: SIMPLE_AGENT_ID,
    instructions: 'You must respond with exactly: OVERRIDE_WORKS',
  })

  assert.equal(run.status, 'completed', 'Run should complete')

  const messages = await client.beta.threads.messages.list(thread.id)
  const assistantMessage = messages.data
    .filter((m) => m.role === 'assistant')
    .at(-1)

  assert.ok(assistantMessage, 'Should have an assistant message')
  const text = (
    assistantMessage?.content[0] as OpenAI.Beta.Threads.MessageContentText
  ).text.value
    .trim()
    .toUpperCase()

  assert.ok(
    text.includes('OVERRIDE'),
    `Response should include OVERRIDE, indicating instructions were overridden. Got: ${text}`,
  )
})
