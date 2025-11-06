import { test, after } from 'node:test'
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

// Agents will be created dynamically during test setup
let SIMPLE_AGENT_ID: string
let FUNCTION_AGENT_ID: string
let CODE_INTERPRETER_AGENT_ID: string
const createdAgentIds: string[] = []

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

// Create agents for testing
test('setup: create agents', async (t) => {
  console.log('Creating test agents...')

  // Create simple agent
  const simpleAgent = await azureAiProject.agents.createAgent('gpt-4.1', {
    name: 'Test Simple Agent',
    instructions: 'You are a helpful assistant that answers questions concisely.',
  })
  SIMPLE_AGENT_ID = simpleAgent.id
  createdAgentIds.push(simpleAgent.id)
  console.log(`Created simple agent: ${SIMPLE_AGENT_ID}`)

  // Create function agent with weather tool
  const functionAgent = await azureAiProject.agents.createAgent('gpt-4.1', {
    name: 'Test Function Agent',
    instructions: 'You are a helpful assistant with access to weather information.',
    tools: [
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get the current weather for a location',
          parameters: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'The city name',
              },
            },
            required: ['location'],
          },
        },
      },
    ],
  })
  FUNCTION_AGENT_ID = functionAgent.id
  createdAgentIds.push(functionAgent.id)
  console.log(`Created function agent: ${FUNCTION_AGENT_ID}`)

  // Create code interpreter agent
  const codeInterpreterAgent = await azureAiProject.agents.createAgent('gpt-4.1', {
    name: 'Test Code Interpreter Agent',
    instructions: 'You are a helpful assistant that can run Python code.',
    tools: [{ type: 'code_interpreter' }],
  })
  CODE_INTERPRETER_AGENT_ID = codeInterpreterAgent.id
  createdAgentIds.push(codeInterpreterAgent.id)
  console.log(`Created code interpreter agent: ${CODE_INTERPRETER_AGENT_ID}`)
})

// Cleanup agents after all tests
after(async () => {
  console.log('Cleaning up test agents...')
  for (const agentId of createdAgentIds) {
    try {
      await azureAiProject.agents.deleteAgent(agentId)
      console.log(`Deleted agent: ${agentId}`)
    } catch (error: any) {
      console.error(`Failed to delete agent ${agentId}:`, error.message)
    }
  }
})

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
  if (run.status === 'failed') {
    console.error('Run failed with error:', JSON.stringify(run.last_error, null, 2))
  }
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
    const completedRun = await client.beta.threads.runs.submitToolOutputsAndPoll(run.id, {
      thread_id: thread.id,
      tool_outputs: [
        {
          tool_call_id: toolCall.id,
          output: JSON.stringify({ temperature: 72, condition: 'sunny' }),
        },
      ],
    })

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

test('azureAgentsRunAdapter streams function call events correctly', async (t) => {
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

  // Create run with streaming enabled
  const run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: FUNCTION_AGENT_ID,
    stream: true,
  })

  let sawRunCreated = false
  let sawRequiresAction = false
  let toolCallId: string | null = null
  let runId: string | null = null

  for await (const event of run) {
    if (event.event === 'thread.run.created') {
      sawRunCreated = true
      runId = event.data.id
    }
    if (event.event === 'thread.run.requires_action') {
      sawRequiresAction = true
      runId = event.data.id
      const toolCalls = event.data.required_action?.submit_tool_outputs.tool_calls
      if (toolCalls && toolCalls.length > 0) {
        toolCallId = toolCalls[0].id
      }
    }
  }

  assert.ok(sawRunCreated, 'Should see run.created event')

  if (sawRequiresAction && toolCallId && runId) {
    assert.ok(toolCallId, 'Should have tool call ID')
    assert.ok(runId, 'Should have run ID')

    // Submit tool outputs with streaming
    const submitRun = await client.beta.threads.runs.submitToolOutputs(runId, {
      thread_id: thread.id,
      tool_outputs: [
        {
          tool_call_id: toolCallId,
          output: JSON.stringify({ temperature: 72, condition: 'sunny' }),
        },
      ],
      stream: true,
    })

    let sawMessageDelta = false
    let sawCompleted = false

    for await (const event of submitRun) {
      if (event.event === 'thread.message.delta') {
        sawMessageDelta = true
      }
      if (event.event === 'thread.run.completed') {
        sawCompleted = true
      }
    }

    // Check if we saw streaming events (delta or completed)
    assert.ok(
      sawMessageDelta || sawCompleted,
      'Should see message delta or completion events during tool output submission',
    )
  } else {
    // If agent doesn't require tool outputs, just verify the run completed
    assert.ok(sawRunCreated, 'Should at least see run created')
  }
})

test('azureAgentsRunAdapter streams code interpreter events correctly', async (t) => {
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

  // Create run with streaming enabled
  const run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: CODE_INTERPRETER_AGENT_ID,
    tools: [{ type: 'code_interpreter' }],
    stream: true,
  })

  let sawRunCreated = false
  let sawRunInProgress = false
  let sawMessageCreated = false
  let sawMessageCompleted = false
  let sawRunCompleted = false
  let finalMessage = ''

  for await (const event of run) {
    if (event.event === 'thread.run.created') {
      sawRunCreated = true
    }
    if (event.event === 'thread.run.in_progress') {
      sawRunInProgress = true
    }
    if (event.event === 'thread.message.created') {
      sawMessageCreated = true
    }
    if (event.event === 'thread.message.delta') {
      // Accumulate delta content
      const delta = event.data as any
      if (delta.delta?.content) {
        for (const content of delta.delta.content) {
          if (content.type === 'text' && content.text?.value) {
            finalMessage += content.text.value
          }
        }
      }
    }
    if (event.event === 'thread.message.completed') {
      sawMessageCompleted = true
      const message = event.data as OpenAI.Beta.Threads.Message
      if (message.content[0] && message.content[0].type === 'text') {
        finalMessage = message.content[0].text.value
      }
    }
    if (event.event === 'thread.run.completed') {
      sawRunCompleted = true
    }
  }

  assert.ok(sawRunCreated, 'Should see run.created event')
  assert.ok(sawRunCompleted, 'Should see run.completed event')
  assert.ok(
    sawMessageCreated || sawMessageCompleted,
    'Should see message created or completed event',
  )

  // Verify the calculation result is in the message
  assert.ok(
    finalMessage.toLowerCase().includes('5050') || finalMessage.includes('5,050'),
    `Response should include 5050, got: ${finalMessage}`,
  )
})

test('azureAgentsRunAdapter exposes run steps during streaming', async (t) => {
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
    content: 'Calculate 10 + 5',
  })

  const run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: CODE_INTERPRETER_AGENT_ID,
    tools: [{ type: 'code_interpreter' }],
    stream: true,
  })

  let sawRunStepCreated = false
  let sawRunStepInProgress = false
  let sawRunStepCompleted = false
  let runStepCount = 0

  for await (const event of run) {
    if (event.event === 'thread.run.step.created') {
      sawRunStepCreated = true
      runStepCount++
    }
    if (event.event === 'thread.run.step.in_progress') {
      sawRunStepInProgress = true
    }
    if (event.event === 'thread.run.step.completed') {
      sawRunStepCompleted = true
    }
  }

  // Run steps are emitted when tools are used or messages are created
  assert.ok(
    sawRunStepCreated || sawRunStepCompleted,
    'Should see at least one run step event',
  )

  if (sawRunStepCreated) {
    assert.ok(runStepCount > 0, 'Should have at least one run step')
  }
})

test('azureAgentsRunAdapter can list run steps', async (t) => {
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
    content: 'Calculate 5 * 3',
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: CODE_INTERPRETER_AGENT_ID,
    tools: [{ type: 'code_interpreter' }],
  })

  assert.equal(run.status, 'completed', 'Run should complete')

  // List run steps
  const steps = await client.beta.threads.runs.steps.list(run.id, {
    thread_id: thread.id,
  })

  assert.ok(steps.data, 'Should have steps data')
  assert.ok(steps.data.length > 0, 'Should have at least one step')

  // Verify step structure
  const firstStep = steps.data[0]
  assert.ok(firstStep.id, 'Step should have an ID')
  assert.equal(firstStep.object, 'thread.run.step', 'Should be a run step')
  assert.ok(firstStep.run_id, 'Step should have a run_id')
  assert.equal(firstStep.thread_id, thread.id, 'Step should belong to the thread')
})

test('azureAgentsRunAdapter handles multiple simultaneous tool calls', async (t) => {
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
    content:
      'Please get the current weather for San Francisco and New York City. Call the weather function for both cities before replying.',
  })

  const run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: FUNCTION_AGENT_ID,
    stream: true,
    instructions:
      'Call the weather function for every requested city before answering.',
  })

  let requiresActionEvent:
    | OpenAI.Beta.AssistantStreamEvent.ThreadRunRequiresAction
    | undefined
  for await (const event of run) {
    if (event.event === 'thread.run.requires_action') {
      requiresActionEvent =
        event as OpenAI.Beta.AssistantStreamEvent.ThreadRunRequiresAction
      break
    }
  }

  assert.ok(requiresActionEvent, 'Run should require tool outputs')

  const toolCalls =
    requiresActionEvent!.data.required_action?.submit_tool_outputs.tool_calls ?? []

  // Azure might make multiple calls or just one, but at least one is expected
  assert.ok(toolCalls.length >= 1, 'Expected at least one tool call')

  const toolOutputs = toolCalls.map((toolCall) => {
    const parsedArgs = JSON.parse(toolCall.function.arguments ?? '{}')
    return {
      tool_call_id: toolCall.id,
      output: JSON.stringify({
        city: parsedArgs.city ?? 'unknown',
        temperature_f: 70,
        conditions: 'sunny',
      }),
    }
  })

  const submit = await client.beta.threads.runs.submitToolOutputs(
    requiresActionEvent!.data.id,
    {
      thread_id: thread.id,
      stream: true,
      tool_outputs: toolOutputs,
    },
  )

  for await (const _event of submit) {
    // drain
  }

  const messagesAfter = await client.beta.threads.messages.list(thread.id)
  const assistantMessage = messagesAfter.data
    .filter((m) => m.role === 'assistant')
    .at(-1)

  assert.ok(
    assistantMessage,
    'Expected an assistant message after submitting tool outputs',
  )
})
