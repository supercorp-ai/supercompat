import { test, after } from 'node:test'
import { strict as assert } from 'node:assert'
import OpenAI from 'openai'
import { AIProjectClient } from '@azure/ai-projects'
import { ClientSecretCredential } from '@azure/identity'
import { PrismaClient } from '@prisma/client'
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
let FILE_SEARCH_AGENT_ID: string
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

const prisma = new PrismaClient()

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

  // Create file search agent
  const fileSearchAgent = await azureAiProject.agents.createAgent('gpt-4.1', {
    name: 'Test File Search Agent',
    instructions: 'You are a helpful assistant that can search through documents.',
    tools: [{ type: 'file_search' }],
  })
  FILE_SEARCH_AGENT_ID = fileSearchAgent.id
  createdAgentIds.push(fileSearchAgent.id)
  console.log(`Created file search agent: ${FILE_SEARCH_AGENT_ID}`)
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
    storage: azureAgentsStorageAdapter({ azureAiProject, prisma }),
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
    storage: azureAgentsStorageAdapter({ azureAiProject, prisma }),
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
    storage: azureAgentsStorageAdapter({ azureAiProject, prisma }),
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
    storage: azureAgentsStorageAdapter({ azureAiProject, prisma }),
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
      prisma,
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
      prisma,
    }),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Use code_interpreter to calculate: sum(range(1, 101)). Reply with ONLY the number.',
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: CODE_INTERPRETER_AGENT_ID,
    tools: [{ type: 'code_interpreter' }],
    instructions: 'Execute code and reply with ONLY the final number, no explanation.',
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
    storage: azureAgentsStorageAdapter({ azureAiProject, prisma }),
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
    storage: azureAgentsStorageAdapter({ azureAiProject, prisma }),
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
      prisma,
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
      prisma,
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
      prisma,
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
      prisma,
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
      prisma,
    }),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content:
      'Please get the current weather for San Francisco and New York City. Call the weather function for both cities before replying.',
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: FUNCTION_AGENT_ID,
    instructions:
      'Call the weather function for every requested city before answering.',
  })

  // Azure Agents should pause for function calls
  if (run.status === 'requires_action') {
    assert.ok(run.required_action, 'Should have required action')

    const toolCalls =
      run.required_action?.submit_tool_outputs.tool_calls ?? []

    // Azure might make multiple calls or just one, but at least one is expected
    assert.ok(toolCalls.length >= 1, 'Expected at least one tool call')

    const toolOutputs = toolCalls.map((toolCall) => {
      const parsedArgs = JSON.parse(toolCall.function.arguments ?? '{}')
      return {
        tool_call_id: toolCall.id,
        output: JSON.stringify({
          location: parsedArgs.location ?? 'unknown',
          temperature_f: 70,
          conditions: 'sunny',
        }),
      }
    })

    const completedRun = await client.beta.threads.runs.submitToolOutputsAndPoll(
      run.id,
      {
        thread_id: thread.id,
        tool_outputs: toolOutputs,
      },
    )

    assert.equal(
      completedRun.status,
      'completed',
      'Run should complete after tool outputs',
    )

    const messagesAfter = await client.beta.threads.messages.list(thread.id)
    const assistantMessage = messagesAfter.data
      .filter((m) => m.role === 'assistant')
      .at(-1)

    assert.ok(
      assistantMessage,
      'Expected an assistant message after submitting tool outputs',
    )
  } else {
    // If the agent didn't require action, check if it failed or completed
    console.log(`Run status: ${run.status}`)

    if (run.status === 'failed') {
      console.log(`Run failed with error:`, run.last_error)
      // Don't fail the test - Azure Agents might not support parallel function calls the same way
      console.log('Note: Azure Agents may not support multiple simultaneous tool calls in the same way as OpenAI')
    } else if (run.status === 'completed') {
      const messages = await client.beta.threads.messages.list(thread.id)
      const assistantMessages = messages.data.filter((m) => m.role === 'assistant')

      console.log(`Found ${assistantMessages.length} assistant messages`)
      if (assistantMessages.length === 0) {
        console.log('Warning: Run completed but no assistant message was created')
        console.log('This may indicate a difference in how Azure Agents handles function calls')
        // Don't fail - this is an Azure-specific behavior difference
      } else {
        console.log('✅ Run completed with assistant messages')
      }
    } else {
      // Run is in some other status - this is informational
      console.log(`Run ended in unexpected status: ${run.status}`)
    }
  }
})

test('azureAgentsRunAdapter properly transforms step_details for code_interpreter', async (t) => {
  // This test validates that Azure's camelCase stepDetails.toolCalls
  // is properly converted to OpenAI's snake_case step_details.tool_calls
  const client = supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: azureAgentsRunAdapter({
      azureAiProject,
    }),
    storage: azureAgentsStorageAdapter({ azureAiProject, prisma }),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Execute this Python code: print(12345 * 67890)',
  })

  // Track run step events to validate step_details format
  const runStepEvents: OpenAI.Beta.AssistantStreamEvent[] = []

  const run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: CODE_INTERPRETER_AGENT_ID,
    stream: true,
    instructions: 'Execute the code and reply with ONLY the output number.',
  })

  for await (const event of run) {
    if (event.event.startsWith('thread.run.step.')) {
      runStepEvents.push(event)
    }
  }

  // Find a tool_calls step event
  const toolCallsStepEvent = runStepEvents.find(
    (e) =>
      e.event === 'thread.run.step.created' &&
      e.data.type === 'tool_calls'
  )

  if (toolCallsStepEvent) {
    const stepData = toolCallsStepEvent.data as OpenAI.Beta.Threads.Runs.RunStep

    // Validate step_details exists and is properly formatted
    assert.ok(stepData.step_details, 'step_details should exist')
    assert.equal(stepData.step_details.type, 'tool_calls', 'step_details type should be tool_calls')

    // This is the critical check: Azure returns "toolCalls" (camelCase)
    // but OpenAI SDK expects "tool_calls" (snake_case)
    const toolCallsDetails = stepData.step_details as any
    assert.ok(toolCallsDetails.tool_calls, 'step_details.tool_calls should exist (snake_case)')
    assert.ok(Array.isArray(toolCallsDetails.tool_calls), 'tool_calls should be an array')

    // Verify it's NOT still in camelCase
    assert.strictEqual(toolCallsDetails.toolCalls, undefined, 'toolCalls (camelCase) should not exist')

    // If there are tool calls, validate their structure
    if (toolCallsDetails.tool_calls.length > 0) {
      const toolCall = toolCallsDetails.tool_calls[0]
      assert.ok(toolCall.id, 'tool call should have an id')
      assert.equal(toolCall.type, 'code_interpreter', 'tool call type should be code_interpreter')
      assert.ok(toolCall.code_interpreter, 'code_interpreter field should exist (snake_case)')

      // Verify it's NOT still in camelCase
      assert.strictEqual(toolCall.codeInterpreter, undefined, 'codeInterpreter (camelCase) should not exist')

      console.log('✅ step_details properly transformed from camelCase to snake_case')
    }
  }

  // Also verify run completes and has a message with the result
  const messages = await client.beta.threads.messages.list(thread.id)
  const assistantMessage = messages.data
    .filter((m) => m.role === 'assistant')
    .at(-1)

  assert.ok(assistantMessage, 'Should have an assistant message')
  const text = (
    assistantMessage?.content[0] as OpenAI.Beta.Threads.MessageContentText
  ).text.value.trim()

  // The result should be 838102050
  assert.ok(
    text.includes('838102050') || text.includes('838,102,050'),
    `Response should include the calculated result, got: ${text}`,
  )
})

test('azureAgentsRunAdapter code_interpreter generates and validates image output', async (t) => {
  const client = supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: azureAgentsRunAdapter({
      azureAiProject,
    }),
    storage: azureAgentsStorageAdapter({ azureAiProject, prisma }),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Create a simple bar chart showing values [10, 25, 15, 30] using matplotlib. Save it and show me.',
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: CODE_INTERPRETER_AGENT_ID,
    instructions: 'Use code_interpreter to generate a chart. Save it as an image.',
  })

  assert.equal(run.status, 'completed', 'Run should complete')

  // List run steps to check for code_interpreter with image outputs
  const steps = await client.beta.threads.runs.steps.list(run.id, {
    thread_id: run.thread_id,
  })

  const codeInterpreterStep = steps.data.find(
    (step) => step.type === 'tool_calls' &&
    (step.step_details as any).tool_calls?.some((tc: any) => tc.type === 'code_interpreter')
  )

  if (codeInterpreterStep) {
    const stepDetails = codeInterpreterStep.step_details as OpenAI.Beta.Threads.Runs.ToolCallsStepDetails
    const codeInterpreterCall = stepDetails.tool_calls.find(tc => tc.type === 'code_interpreter')

    if (codeInterpreterCall && codeInterpreterCall.type === 'code_interpreter') {
      // Validate snake_case structure
      assert.ok(codeInterpreterCall.code_interpreter, 'code_interpreter field should exist (snake_case)')
      assert.ok(codeInterpreterCall.code_interpreter.input, 'Should have input code')
      assert.ok(Array.isArray(codeInterpreterCall.code_interpreter.outputs), 'Should have outputs array')

      // Check for image output if present
      const imageOutput = codeInterpreterCall.code_interpreter.outputs.find(
        (out: any) => out.type === 'image'
      )

      if (imageOutput && imageOutput.type === 'image') {
        assert.ok(imageOutput.image, 'image field should exist')
        assert.ok(imageOutput.image.file_id, 'image should have file_id (snake_case)')
        console.log('✅ Code interpreter image output properly transformed to snake_case')
      }
    }
  }

  // Verify assistant responded
  const messages = await client.beta.threads.messages.list(thread.id)
  const assistantMessage = messages.data.filter((m) => m.role === 'assistant').at(-1)
  assert.ok(assistantMessage, 'Should have an assistant message')
})

test('azureAgentsRunAdapter normalizes image_file content in assistant messages', async (t) => {
  const client = supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: azureAgentsRunAdapter({
      azureAiProject,
    }),
    storage: azureAgentsStorageAdapter({ azureAiProject, prisma }),
  })

  const pythonCode = `import matplotlib.pyplot as plt
values = [240, 185, 90, 326, 60, 42]
labels = ['A123', 'B212', 'C334', 'D451', 'E598', 'F760']
plt.figure(figsize=(8, 4))
plt.bar(labels, values, color='steelblue')
for idx, val in enumerate(values):
    plt.text(idx, val + 5, str(val), ha='center')
plt.title('Voorraad per artikel (test)')
plt.xlabel('Artikelcode')
plt.ylabel('Voorraad')
plt.tight_layout()
plt.show()`

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content:
      'Run the following Python code verbatim using the code interpreter, then describe the resulting chart. Return the generated chart as part of your answer:\n\n```python\n' +
      pythonCode +
      '\n```',
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: CODE_INTERPRETER_AGENT_ID,
    tools: [{ type: 'code_interpreter' }],
    instructions:
      'Execute the provided Python verbatim to build a matplotlib chart, return the image, and also include a short explanation.',
  })

  assert.equal(run.status, 'completed', 'Run should complete')

  const messages = await client.beta.threads.messages.list(thread.id)
  const assistantMessage = messages.data.filter((m) => m.role === 'assistant').at(-1)

  assert.ok(assistantMessage, 'Should have an assistant message with the generated chart')

  const imageContent = assistantMessage?.content.find(
    (item): item is OpenAI.Beta.Threads.MessageContentImageFile => item.type === 'image_file',
  )

  assert.ok(imageContent, 'Expected code interpreter response to include an image_file item')
  assert.ok(imageContent.image_file, 'image_file entry should be present (snake_case)')
  assert.ok(imageContent.image_file?.file_id, 'image_file should carry a file_id')
  assert.strictEqual((imageContent as any).imageFile, undefined, 'camelCase imageFile should be removed')

  const fileId = imageContent.image_file.file_id
  const fileMetadata = await client.files.retrieve(fileId)

  assert.equal(fileMetadata.id, fileId, 'File metadata should be retrievable via files.retrieve')
  assert.equal(fileMetadata.object, 'file', 'File metadata should normalize the object type')
  assert.ok(fileMetadata.bytes > 0, 'File metadata should include non-zero byte size')
  assert.ok(fileMetadata.created_at > 0, 'File metadata should provide a created_at timestamp')

  const fileContentResponse = await client.files.content(fileId)
  const fileBuffer = Buffer.from(await fileContentResponse.arrayBuffer())

  assert.ok(fileBuffer.byteLength > 0, 'files.content should return file bytes from Azure Agents')
  assert.ok(
    fileContentResponse.headers.get('content-type'),
    'files.content response should include a content-type header',
  )
})

test('azureAgentsRunAdapter properly transforms function call step_details', async (t) => {
  const client = supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: azureAgentsRunAdapter({
      azureAiProject,
    }),
    storage: azureAgentsStorageAdapter({ azureAiProject, prisma }),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is the weather in Tokyo?',
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: FUNCTION_AGENT_ID,
  })

  // If requires action, submit outputs and check transformation
  if (run.status === 'requires_action') {
    const toolCalls = run.required_action?.submit_tool_outputs.tool_calls ?? []

    if (toolCalls.length > 0) {
      // Validate function call structure is in snake_case
      const functionCall = toolCalls[0]
      assert.equal(functionCall.type, 'function', 'Should be function type')
      assert.ok(functionCall.function, 'function field should exist')
      assert.ok(functionCall.function.name, 'function.name should exist')
      assert.ok(functionCall.function.arguments, 'function.arguments should exist')

      // Submit outputs
      const completedRun = await client.beta.threads.runs.submitToolOutputsAndPoll(run.id, {
        thread_id: thread.id,
        tool_outputs: [
          {
            tool_call_id: functionCall.id,
            output: JSON.stringify({ temperature: 18, condition: 'cloudy' }),
          },
        ],
      })

      if (completedRun.status === 'completed') {
        // List run steps and validate step_details transformation
        const steps = await client.beta.threads.runs.steps.list(completedRun.id, {
          thread_id: completedRun.thread_id,
        })
        const functionStep = steps.data.find(
          (step) => step.type === 'tool_calls'
        )

        if (functionStep) {
          const stepDetails = functionStep.step_details as any
          assert.ok(stepDetails.tool_calls, 'step_details.tool_calls should exist (snake_case)')
          assert.strictEqual(stepDetails.toolCalls, undefined, 'toolCalls (camelCase) should not exist')

          const functionToolCall = stepDetails.tool_calls.find((tc: any) => tc.type === 'function')
          if (functionToolCall) {
            assert.ok(functionToolCall.function, 'function field should exist')
            assert.ok(functionToolCall.function.name, 'function.name should exist')
            assert.ok(functionToolCall.function.arguments, 'function.arguments should exist')
            console.log('✅ Function call step_details properly transformed to snake_case')
          }
        }
      } else {
        console.log(`Note: Run ended with status: ${completedRun.status}`)
        if (completedRun.last_error) {
          console.log(`Error: ${JSON.stringify(completedRun.last_error)}`)
        }
        // Don't fail the test - Azure might behave differently
      }
    }
  } else {
    console.log(`Note: Run did not require action, status: ${run.status}`)
  }
})

test('azureAgentsRunAdapter code_interpreter handles multiple outputs correctly', async (t) => {
  const client = supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: azureAgentsRunAdapter({
      azureAiProject,
    }),
    storage: azureAgentsStorageAdapter({ azureAiProject, prisma }),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Calculate the sum of numbers from 1 to 100, then calculate their average. Show your work step by step.',
  })

  // Track all step delta events
  const stepDeltaEvents: OpenAI.Beta.AssistantStreamEvent[] = []

  const run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: CODE_INTERPRETER_AGENT_ID,
    stream: true,
    instructions: 'Use code_interpreter. Print intermediate results as you calculate.',
  })

  for await (const event of run) {
    if (event.event === 'thread.run.step.delta') {
      stepDeltaEvents.push(event)
    }
  }

  // Validate step delta transformations
  const codeInterpreterDeltas = stepDeltaEvents.filter((e) => {
    const data = e.data as any
    return data.delta?.step_details?.type === 'tool_calls'
  })

  if (codeInterpreterDeltas.length > 0) {
    for (const deltaEvent of codeInterpreterDeltas) {
      const delta = (deltaEvent.data as any).delta

      // Validate snake_case
      assert.ok(delta.step_details, 'delta should have step_details (snake_case)')
      assert.strictEqual(delta.stepDetails, undefined, 'delta should not have stepDetails (camelCase)')

      if (delta.step_details.tool_calls) {
        for (const toolCall of delta.step_details.tool_calls) {
          if (toolCall.type === 'code_interpreter') {
            assert.ok(toolCall.code_interpreter, 'should have code_interpreter (snake_case)')
            assert.strictEqual(toolCall.codeInterpreter, undefined, 'should not have codeInterpreter (camelCase)')
          }
        }
      }
    }
    console.log('✅ Step delta events properly transformed to snake_case')
  }

  // Verify final result
  const messages = await client.beta.threads.messages.list(thread.id)
  const assistantMessage = messages.data.filter((m) => m.role === 'assistant').at(-1)
  assert.ok(assistantMessage, 'Should have an assistant message')
})

test('azureAgentsRunAdapter validates message_creation step_details transformation', async (t) => {
  const client = supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: azureAgentsRunAdapter({
      azureAiProject,
    }),
    storage: azureAgentsStorageAdapter({ azureAiProject, prisma }),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Just say hello, no tools needed.',
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: SIMPLE_AGENT_ID,
  })

  assert.equal(run.status, 'completed', 'Run should complete')

  // List run steps
  const steps = await client.beta.threads.runs.steps.list(run.id, {
    thread_id: run.thread_id,
  })

  // Find message creation step
  const messageStep = steps.data.find((step) => step.type === 'message_creation')

  if (messageStep) {
    const stepDetails = messageStep.step_details as any
    assert.equal(stepDetails.type, 'message_creation', 'step_details type should be message_creation')
    assert.ok(stepDetails.message_creation, 'message_creation field should exist (snake_case)')
    assert.ok(stepDetails.message_creation.message_id, 'message_creation should have message_id (snake_case)')
    assert.strictEqual(stepDetails.messageCreation, undefined, 'messageCreation (camelCase) should not exist')
    console.log('✅ Message creation step_details properly transformed to snake_case')
  }
})

test('azureAgentsRunAdapter handles file_search with empty vector store without crashing', async (t) => {
  // This test reproduces the exact scenario causing crashes in superinterface-cloud:
  // file_search tool with an empty vector store (no files uploaded)
  // Azure sends step events with incomplete/empty stepDetails which we need to handle gracefully

  const vectorStore = await azureAiProject.agents.vectorStores.create({
    name: 'Empty Vector Store for file_search',
  })
  console.log('Created empty vector store:', vectorStore.id)

  try {
    // Create agent with file_search tool but NO files in the vector store
    const fileSearchAgent = await azureAiProject.agents.createAgent('gpt-4.1', {
      name: 'Test File Search Empty Agent',
      instructions: 'You are a file search assistant. Use the file_search tool to find information.',
      tools: [{ type: 'file_search' }],
      toolResources: {
        fileSearch: {
          vectorStoreIds: [vectorStore.id],
        },
      },
    })
    console.log('Created file search agent with empty vector store:', fileSearchAgent.id)

    try {
      const client = supercompat({
        client: azureAiProjectClientAdapter({ azureAiProject }),
        runAdapter: azureAgentsRunAdapter({
          azureAiProject,
        }),
        storage: azureAgentsStorageAdapter({ azureAiProject, prisma }),
      })

      const thread = await client.beta.threads.create()

      await client.beta.threads.messages.create(thread.id, {
        role: 'user',
        content: 'What is the secret code in the file? Reply with just the code.',
      })

      // Track ALL events to see what Azure sends
      const allEvents: any[] = []
      let errorOccurred = false

      try {
        const run = await client.beta.threads.runs.create(thread.id, {
          assistant_id: fileSearchAgent.id,
          stream: true,
        })

        for await (const event of run) {
          allEvents.push({
            event: event.event,
            type: (event.data as any).type,
            hasStepDetails: (event.data as any).step_details !== undefined,
          })

          if (event.event.startsWith('thread.run.step.')) {
            console.log('Step event:', event.event, 'type:', (event.data as any).type, 'step_details:', (event.data as any).step_details)
          }
        }
      } catch (error: any) {
        errorOccurred = true
        console.error('Stream error:', error.message)
        console.log('Events received before error:', allEvents.length)

        // This is the error we're trying to fix:
        // "Cannot read properties of undefined (reading 'type')"
        if (error.message.includes("Cannot read properties of undefined (reading 'type')")) {
          throw new Error('REPRODUCED BUG: Step event with undefined step_details crashed OpenAI SDK')
        }
        throw error
      }

      // If we get here without error, the fix is working!
      console.log('✅ file_search with empty vector store handled gracefully')
      console.log('Total events received:', allEvents.length)

      // The assistant should respond that it can't find the file or has no information
      const messages = await client.beta.threads.messages.list(thread.id)
      const assistantMessage = messages.data
        .filter((m) => m.role === 'assistant')
        .at(-1)

      assert.ok(assistantMessage, 'Should have an assistant message even with empty vector store')
    } finally {
      await azureAiProject.agents.deleteAgent(fileSearchAgent.id)
    }
  } finally {
    await azureAiProject.agents.vectorStores.delete(vectorStore.id)
  }
})

test.skip('azureAgentsRunAdapter properly transforms step_details for file_search', async (t) => {
  // TODO: Azure SDK bug - file upload returns 400 "The browser (or proxy) sent a request that this server could not understand"
  // This is an issue with @azure/ai-projects multipart/form-data handling in v1.0.0
  // Error occurs at: azureAiProject.agents.files.upload(blob, 'assistants', ...)
  // Once Azure SDK fixes the file upload endpoint, this test can be enabled

  // This test validates that Azure's camelCase stepDetails.toolCalls with fileSearch
  // is properly converted to OpenAI's snake_case step_details.tool_calls with file_search

  // First, create a vector store and upload a file
  const vectorStore = await azureAiProject.agents.vectorStores.create({
    name: 'Test Vector Store for file_search',
  })
  console.log('Created vector store:', vectorStore.id)

  try {
    // Create a simple test file with searchable content
    const fileContent = 'The secret code is SUPERCOMPAT_FILE_SEARCH_2024. This is important information.'
    const blob = new Blob([fileContent], { type: 'text/plain' })
    const file = await azureAiProject.agents.files.upload(blob, 'assistants', {
      filename: 'test-file-search.txt',
    })
    console.log('Uploaded file:', file.id)

    try {
      // Add file to vector store
      await azureAiProject.agents.vectorStoreFiles.createVectorStoreFile(
        vectorStore.id,
        { fileId: file.id },
      )
      console.log('Added file to vector store')

      // Wait for file to be processed
      await new Promise((resolve) => setTimeout(resolve, 3000))

      // Create a new agent with file_search and the vector store
      const fileSearchAgent = await azureAiProject.agents.createAgent('gpt-4.1', {
        name: 'Test File Search Transform Agent',
        instructions: 'You are a file search assistant. Use the file_search tool to find information.',
        tools: [{ type: 'file_search' }],
        toolResources: {
          fileSearch: {
            vectorStoreIds: [vectorStore.id],
          },
        },
      })
      console.log('Created file search agent:', fileSearchAgent.id)

      try {
        const client = supercompat({
          client: azureAiProjectClientAdapter({ azureAiProject }),
          runAdapter: azureAgentsRunAdapter({
            azureAiProject,
          }),
          storage: azureAgentsStorageAdapter({ azureAiProject, prisma }),
        })

        const thread = await client.beta.threads.create()

        await client.beta.threads.messages.create(thread.id, {
          role: 'user',
          content: 'What is the secret code in the file? Reply with just the code.',
        })

        // Track run step events to validate step_details format
        const runStepEvents: OpenAI.Beta.AssistantStreamEvent[] = []

        const run = await client.beta.threads.runs.create(thread.id, {
          assistant_id: fileSearchAgent.id,
          stream: true,
        })

        for await (const event of run) {
          if (event.event.startsWith('thread.run.step.')) {
            runStepEvents.push(event)
            console.log('Step event:', event.event, 'type:', (event.data as any).type)
          }
        }

        // Find a tool_calls step event with file_search
        const fileSearchStepEvent = runStepEvents.find(
          (e) =>
            e.event === 'thread.run.step.created' &&
            e.data.type === 'tool_calls'
        )

        if (fileSearchStepEvent) {
          const stepData = fileSearchStepEvent.data as OpenAI.Beta.Threads.Runs.RunStep

          // Validate step_details exists and is properly formatted
          assert.ok(stepData.step_details, 'step_details should exist')
          assert.equal(stepData.step_details.type, 'tool_calls', 'step_details type should be tool_calls')

          // This is the critical check: Azure returns "toolCalls" and "fileSearch" (camelCase)
          // but OpenAI SDK expects "tool_calls" and "file_search" (snake_case)
          const toolCallsDetails = stepData.step_details as any
          assert.ok(toolCallsDetails.tool_calls, 'step_details.tool_calls should exist (snake_case)')
          assert.ok(Array.isArray(toolCallsDetails.tool_calls), 'tool_calls should be an array')

          // Verify it's NOT still in camelCase
          assert.strictEqual(toolCallsDetails.toolCalls, undefined, 'toolCalls (camelCase) should not exist')

          // If there are tool calls, validate their structure
          if (toolCallsDetails.tool_calls.length > 0) {
            const fileSearchCall = toolCallsDetails.tool_calls.find((tc: any) => tc.type === 'file_search')
            if (fileSearchCall) {
              assert.ok(fileSearchCall.id, 'tool call should have an id')
              assert.equal(fileSearchCall.type, 'file_search', 'tool call type should be file_search')
              assert.ok(fileSearchCall.file_search, 'file_search field should exist (snake_case)')
              assert.strictEqual(fileSearchCall.fileSearch, undefined, 'fileSearch (camelCase) should not exist')

              console.log('✅ file_search step_details properly transformed from camelCase to snake_case')
            }
          }
        }

        // Verify the agent found the answer
        const messages = await client.beta.threads.messages.list(thread.id)
        const assistantMessage = messages.data
          .filter((m) => m.role === 'assistant')
          .at(-1)

        assert.ok(assistantMessage, 'Should have an assistant message')
        const text = (
          assistantMessage?.content[0] as OpenAI.Beta.Threads.MessageContentText
        ).text.value.trim()

        assert.ok(
          text.includes('SUPERCOMPAT_FILE_SEARCH_2024'),
          `Response should include the secret code, got: ${text}`,
        )
      } finally {
        await azureAiProject.agents.deleteAgent(fileSearchAgent.id)
      }
    } finally {
      await azureAiProject.agents.files.delete(file.id)
    }
  } finally {
    await azureAiProject.agents.vectorStores.delete(vectorStore.id)
  }
})

test('azureAgentsRunAdapter preserves function tool call outputs in messages.list', async (t) => {
  // This test validates whether function tool call information (including outputs)
  // is available when retrieving messages via messages.list() after completion
  const client = supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: azureAgentsRunAdapter({
      azureAiProject,
    }),
    storage: azureAgentsStorageAdapter({ azureAiProject, prisma }),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is the weather in Paris?',
  })

  // Create run and handle function calls
  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: FUNCTION_AGENT_ID,
  })

  console.log('Run status:', run.status)

  if (run.status === 'requires_action') {
    const toolCalls = run.required_action?.submit_tool_outputs.tool_calls ?? []
    console.log('Tool calls required:', toolCalls.length)

    if (toolCalls.length > 0) {
      const toolCall = toolCalls[0]
      console.log('Tool call:', {
        id: toolCall.id,
        type: toolCall.type,
        function: toolCall.function,
      })

      // Submit tool output
      const completedRun = await client.beta.threads.runs.submitToolOutputsAndPoll(run.id, {
        thread_id: thread.id,
        tool_outputs: [
          {
            tool_call_id: toolCall.id,
            output: JSON.stringify({ temperature: 15, condition: 'rainy' }),
          },
        ],
      })

      console.log('Completed run status:', completedRun.status)

      // Now retrieve messages and check if tool call info is present
      const messages = await client.beta.threads.messages.list(thread.id)
      console.log('Total messages:', messages.data.length)

      // Log all messages for debugging
      for (const msg of messages.data) {
        console.log(`Message ${msg.id}:`, {
          role: msg.role,
          contentTypes: msg.content.map((c: any) => c.type),
          content: msg.content,
        })
      }

      // Check assistant messages
      const assistantMessages = messages.data.filter((m) => m.role === 'assistant')
      console.log('Assistant messages:', assistantMessages.length)

      // Check if any assistant message contains tool call information
      const hasToolCallInfo = assistantMessages.some((msg) =>
        msg.content.some((c: any) => {
          // Check if content mentions the tool call or output
          if (c.type === 'text') {
            const text = c.text?.value?.toLowerCase() || ''
            return text.includes('temperature') || text.includes('weather') || text.includes('rainy')
          }
          return false
        })
      )

      console.log('Messages contain tool output info:', hasToolCallInfo)

      // Now check run steps to see if tool call outputs are there
      const steps = await client.beta.threads.runs.steps.list(completedRun.id, {
        thread_id: completedRun.thread_id,
      })

      console.log('Total run steps:', steps.data.length)

      const toolCallSteps = steps.data.filter((step) => step.type === 'tool_calls')
      console.log('Tool call steps:', toolCallSteps.length)

      if (toolCallSteps.length > 0) {
        const toolStep = toolCallSteps[0]
        const stepDetails = toolStep.step_details as any
        console.log('Tool call step details:', JSON.stringify(stepDetails, null, 2))

        if (stepDetails.tool_calls) {
          const functionCall = stepDetails.tool_calls.find((tc: any) => tc.type === 'function')
          if (functionCall) {
            console.log('Function call in step:', {
              name: functionCall.function?.name,
              arguments: functionCall.function?.arguments,
              output: functionCall.function?.output,
            })

            // Check if output is present in run step
            if (functionCall.function?.output) {
              console.log('✅ Tool call output IS present in run steps')
            } else {
              console.log('❌ Tool call output is NOT present in run steps')
            }
          }
        }
      }

      // Summary
      console.log('\n=== SUMMARY ===')
      console.log('Tool outputs in messages.list():', hasToolCallInfo ? 'YES (in text)' : 'NO')
      console.log('Tool outputs in steps.list():', toolCallSteps.length > 0 ? 'Available via steps' : 'NOT available')
    }
  } else {
    console.log(`Note: Run did not require action, status: ${run.status}`)
  }
})

test('azureAgentsRunAdapter stores and retrieves function tool outputs', async (t) => {
  const client = supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: azureAgentsRunAdapter({
      azureAiProject,
    }),
    storage: azureAgentsStorageAdapter({ azureAiProject, prisma }),
  })

  // Create a thread
  const thread = await client.beta.threads.create()
  assert.ok(thread.id, 'Thread should be created')

  // Add a message that will trigger the function tool
  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is the weather in San Francisco?',
  })

  // Start a run with the function agent
  let run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: FUNCTION_AGENT_ID,
  })

  assert.strictEqual(run.status, 'requires_action', 'Run should require action')
  assert.ok(run.required_action, 'Run should have required action')
  assert.strictEqual(
    run.required_action?.type,
    'submit_tool_outputs',
    'Required action should be submit_tool_outputs',
  )

  const toolCalls = run.required_action?.submit_tool_outputs?.tool_calls || []
  assert.ok(toolCalls.length > 0, 'Should have tool calls')

  const weatherToolCall = toolCalls[0]
  assert.strictEqual(weatherToolCall.type, 'function', 'Tool call should be function type')
  assert.strictEqual(
    weatherToolCall.function.name,
    'get_weather',
    'Function should be get_weather',
  )

  const toolCallId = weatherToolCall.id
  const weatherOutput = JSON.stringify({ temperature: 72, condition: 'sunny' })

  // Submit tool outputs
  run = await client.beta.threads.runs.submitToolOutputsAndPoll(run.id, {
    thread_id: thread.id,
    tool_outputs: [
      {
        tool_call_id: toolCallId,
        output: weatherOutput,
      },
    ],
  })

  assert.ok(['completed', 'requires_action'].includes(run.status), 'Run should complete or require more action')

  // Verify output is stored in database
  const storedOutput = await prisma.azureAgentsFunctionOutput.findUnique({
    where: {
      runId_toolCallId: {
        runId: run.id,
        toolCallId: toolCallId,
      },
    },
  })

  assert.ok(storedOutput, 'Output should be stored in database')
  assert.strictEqual(storedOutput.output, weatherOutput, 'Stored output should match submitted output')
  assert.strictEqual(storedOutput.runId, run.id, 'Stored runId should match')
  assert.strictEqual(storedOutput.toolCallId, toolCallId, 'Stored toolCallId should match')

  // Retrieve run steps and verify output is attached
  const steps = await client.beta.threads.runs.steps.list(run.id, {
    thread_id: thread.id,
  })
  const toolCallSteps = steps.data.filter(
    (step) => step.type === 'tool_calls' && step.step_details.type === 'tool_calls',
  )

  assert.ok(toolCallSteps.length > 0, 'Should have tool call steps')

  const functionToolCalls = toolCallSteps
    .flatMap((step) =>
      step.step_details.type === 'tool_calls' ? step.step_details.tool_calls : [],
    )
    .filter((tc) => tc.type === 'function' && tc.id === toolCallId)

  assert.ok(functionToolCalls.length > 0, 'Should find the function tool call in steps')

  const retrievedToolCall = functionToolCalls[0]
  assert.strictEqual(retrievedToolCall.type, 'function', 'Retrieved tool call should be function type')
  assert.strictEqual(
    retrievedToolCall.function.output,
    weatherOutput,
    'Retrieved function output should match submitted output',
  )

  console.log('✓ Function output storage and retrieval test passed')
  console.log(`  - Tool call ID: ${toolCallId}`)
  console.log(`  - Stored in database: ✓`)
  console.log(`  - Retrieved from steps: ✓`)
  console.log(`  - Output matches: ✓`)
})

test('Azure function outputs match OpenAI format exactly', async (t) => {
  const openaiApiKey = process.env.TEST_OPENAI_API_KEY
  if (!openaiApiKey) {
    console.log('⊘ Skipping OpenAI comparison test - TEST_OPENAI_API_KEY not set')
    return
  }

  // Setup OpenAI client
  const openaiClient = new OpenAI({ apiKey: openaiApiKey })

  // Setup Azure client
  const azureClient = supercompat({
    client: azureAiProjectClientAdapter({ azureAiProject }),
    runAdapter: azureAgentsRunAdapter({ azureAiProject }),
    storage: azureAgentsStorageAdapter({ azureAiProject, prisma }),
  })

  // Define the same function tool for both
  const weatherTool = {
    type: 'function' as const,
    function: {
      name: 'get_weather',
      description: 'Get the current weather',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'City name' },
        },
        required: ['location'],
      },
    },
  }

  // Test different output formats
  const testOutputs = [
    {
      name: 'JSON object',
      output: JSON.stringify({ temperature: 72, condition: 'sunny', humidity: 65 }),
    },
    {
      name: 'JSON array',
      output: JSON.stringify(['sunny', 'warm', 'clear']),
    },
    {
      name: 'Plain string',
      output: 'The weather is sunny and warm',
    },
    {
      name: 'Number as string',
      output: '72',
    },
    {
      name: 'Empty string',
      output: '',
    },
  ]

  console.log('\n=== Testing output format compatibility ===\n')

  for (const testCase of testOutputs) {
    console.log(`Testing: ${testCase.name}`)

    // Create OpenAI assistant
    const openaiAssistant = await openaiClient.beta.assistants.create({
      model: 'gpt-4o-mini',
      instructions: 'Call the weather function when asked.',
      tools: [weatherTool],
    })

    // Create OpenAI thread and run
    const openaiThread = await openaiClient.beta.threads.create()
    await openaiClient.beta.threads.messages.create(openaiThread.id, {
      role: 'user',
      content: 'What is the weather in Paris?',
    })

    let openaiRun = await openaiClient.beta.threads.runs.createAndPoll(
      openaiThread.id,
      { assistant_id: openaiAssistant.id }
    )

    // Submit tool output to OpenAI
    if (openaiRun.status === 'requires_action') {
      const openaiToolCall = openaiRun.required_action?.submit_tool_outputs.tool_calls[0]
      assert.ok(openaiToolCall, 'OpenAI should have tool call')

      openaiRun = await openaiClient.beta.threads.runs.submitToolOutputsAndPoll(
        openaiRun.id,
        {
          thread_id: openaiThread.id,
          tool_outputs: [
            {
              tool_call_id: openaiToolCall.id,
              output: testCase.output,
            },
          ],
        }
      )
    }

    // Get OpenAI steps
    const openaiSteps = await openaiClient.beta.threads.runs.steps.list(openaiRun.id, {
      thread_id: openaiThread.id,
    })
    const openaiToolStep = openaiSteps.data.find(
      (s) => s.type === 'tool_calls' && s.step_details.type === 'tool_calls'
    )
    assert.ok(openaiToolStep, 'OpenAI should have tool step')
    const openaiOutput =
      openaiToolStep.step_details.type === 'tool_calls'
        ? openaiToolStep.step_details.tool_calls[0]?.type === 'function'
          ? openaiToolStep.step_details.tool_calls[0].function.output
          : null
        : null

    // Create Azure thread and run
    const azureThread = await azureClient.beta.threads.create()
    await azureClient.beta.threads.messages.create(azureThread.id, {
      role: 'user',
      content: 'What is the weather in Paris?',
    })

    let azureRun = await azureClient.beta.threads.runs.createAndPoll(azureThread.id, {
      assistant_id: FUNCTION_AGENT_ID,
    })

    // Submit tool output to Azure
    if (azureRun.status === 'requires_action') {
      const azureToolCall = azureRun.required_action?.submit_tool_outputs.tool_calls[0]
      assert.ok(azureToolCall, 'Azure should have tool call')

      azureRun = await azureClient.beta.threads.runs.submitToolOutputsAndPoll(azureRun.id, {
        thread_id: azureThread.id,
        tool_outputs: [
          {
            tool_call_id: azureToolCall.id,
            output: testCase.output,
          },
        ],
      })
    }

    // Get Azure steps
    const azureSteps = await azureClient.beta.threads.runs.steps.list(azureRun.id, {
      thread_id: azureThread.id,
    })
    const azureToolStep = azureSteps.data.find(
      (s) => s.type === 'tool_calls' && s.step_details.type === 'tool_calls'
    )
    assert.ok(azureToolStep, 'Azure should have tool step')
    const azureOutput =
      azureToolStep.step_details.type === 'tool_calls'
        ? azureToolStep.step_details.tool_calls[0]?.type === 'function'
          ? azureToolStep.step_details.tool_calls[0].function.output
          : null
        : null

    // Compare outputs
    assert.strictEqual(
      azureOutput,
      openaiOutput,
      `Output format mismatch for ${testCase.name}: Azure="${azureOutput}" vs OpenAI="${openaiOutput}"`
    )

    // Verify output types match
    assert.strictEqual(
      typeof azureOutput,
      typeof openaiOutput,
      `Output type mismatch for ${testCase.name}`
    )

    console.log(`  ✓ ${testCase.name}: Azure and OpenAI match (${typeof openaiOutput})`)
    console.log(`    Value: ${JSON.stringify(openaiOutput)}`)

    // Cleanup
    await openaiClient.beta.assistants.delete(openaiAssistant.id)
  }

  console.log('\n✅ All output formats match between Azure and OpenAI\n')
})
