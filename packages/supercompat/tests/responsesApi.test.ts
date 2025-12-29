import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import OpenAI from 'openai'
import dayjs from 'dayjs'
import { ProxyAgent, setGlobalDispatcher } from 'undici'
import { HttpsProxyAgent } from 'https-proxy-agent'
import {
  responsesRunAdapter,
  openaiClientAdapter,
  supercompat,
  responsesStorageAdapter,
} from '../src/index'

// Skip slow tests if SKIP_SLOW_TESTS is set
const shouldSkipSlowTests = process.env.SKIP_SLOW_TESTS === 'true'
const testOrSkip = shouldSkipSlowTests ? test.skip : test

const apiKey = process.env.TEST_OPENAI_API_KEY

if (process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY))
}

testOrSkip('responsesRunAdapter can create thread message and run via OpenAI', async (t) => {
  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const openaiAssistant = {
    id: 'some-assistant-id',
    object: 'assistant' as const,
    model: 'gpt-4.1-mini',
    instructions: 'You are a concise, helpful assistant.',
    description: null,
    name: 'Some Assistant',
    metadata: {},
    tools: [],
    created_at: dayjs().unix(),
  }

  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: responsesRunAdapter({
      getOpenaiAssistant: () => openaiAssistant,
    }),
    storage: responsesStorageAdapter(),
  })

  // const assistant = await client.beta.assistants.create({
  //   model: 'gpt-4o',
  //   instructions: 'You are a helpful assistant.',
  // })
  //
  const thread = await client.beta.threads.create()

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
  const text = (
    assistantMessage?.content[0] as OpenAI.Beta.Threads.MessageContentText
  ).text.value.trim()
  assert.equal(text, '4')
})

testOrSkip('responsesRunAdapter maintains conversation across runs', async (t) => {
  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const openaiAssistant = {
    id: 'some-assistant-id',
    object: 'assistant' as const,
    model: 'gpt-4.1-mini',
    instructions: 'You are a concise, helpful assistant.',
    description: null,
    name: 'Some Assistant',
    metadata: {},
    tools: [],
    created_at: dayjs().unix(),
  }

  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: responsesRunAdapter({
      getOpenaiAssistant: () => openaiAssistant,
    }),
    storage: responsesStorageAdapter(),
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
  const text = (
    assistantMessage?.content[0] as OpenAI.Beta.Threads.MessageContentText
  ).text.value
    .trim()
    .toLowerCase()
  assert.ok(text.includes('blue'))
})

test('responsesRunAdapter streams tool calls via OpenAI', async () => {
  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const tools = [
    {
      type: 'function',
      function: {
        name: 'get_current_weather',
        description: 'Get the current weather in a given location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA',
            },
            unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
          },
          required: ['location'],
        },
      },
    },
  ] as OpenAI.Beta.AssistantTool[]

  const openaiAssistant = {
    id: 'some-assistant-id',
    object: 'assistant' as const,
    model: 'gpt-4.1-mini',
    instructions: 'You are a concise, helpful assistant.',
    description: null,
    name: 'Some Assistant',
    metadata: {},
    tools,
    created_at: dayjs().unix(),
  }

  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: responsesRunAdapter({
      getOpenaiAssistant: () => openaiAssistant,
    }),
    storage: responsesStorageAdapter(),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is the weather in SF?',
  })

  const run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: openaiAssistant.id,
    instructions:
      'Use the get_current_weather tool and then answer the message.',
    stream: true,
    tools,
  })

  let requiresActionEvent:
    | OpenAI.Beta.AssistantStreamEvent.ThreadRunRequiresAction
    | undefined
  for await (const event of run) {
    if (event.event === 'thread.run.requires_action') {
      requiresActionEvent = event as OpenAI.Beta.AssistantStreamEvent.ThreadRunRequiresAction
    }
  }

  assert.ok(requiresActionEvent)

  const runSteps = await client.beta.threads.runs.steps.list(
    requiresActionEvent!.data.id,
    { thread_id: thread.id },
  )
  const toolStep = runSteps.data.find(
    (s) => s.step_details?.type === 'tool_calls',
  )
  assert.equal(toolStep?.step_details?.tool_calls[0]?.type, 'function')

  const toolCallId =
    requiresActionEvent!.data.required_action?.submit_tool_outputs
      .tool_calls[0].id

  const submit = await client.beta.threads.runs.submitToolOutputs(
    requiresActionEvent!.data.id,
    {
      thread_id: thread.id,
      stream: true,
      tool_outputs: [
        {
          tool_call_id: toolCallId,
          output: '70 degrees and sunny.',
        },
      ],
    },
  )

  for await (const _event of submit) {
  }

  const listAfter = await client.beta.threads.messages.list(thread.id)
  assert.ok(listAfter.data[0].content[0].text.value.includes('70'))
  // // Messages can arrive slightly after the streaming iterator completes.
  // // Poll briefly to avoid flakiness without slowing the path when ready.
  // let finalText = ''
  // for (let i = 0; i < 20; i++) {
  //   const finalAssistant = listAfter.data
  //     .filter((m) => m.role === 'assistant')
  //     .at(-1)
  //   const maybeText = (
  //     finalAssistant?.content?.[0] as OpenAI.Beta.Threads.MessageContentText | undefined
  //   )?.text?.value
  //   if (typeof maybeText === 'string' && maybeText.trim().length > 0) {
  //     finalText = maybeText.toLowerCase()
  //     break
  //   }
  //   await new Promise((r) => setTimeout(r, 200))
  // }
  // assert.ok(finalText.includes('70'))
})

testOrSkip('responsesRunAdapter handles multiple simultaneous tool calls', async (t) => {
  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const tools = [
    {
      type: 'function',
      function: {
        name: 'get_city_weather',
        description: 'Get the current weather in a given city.',
        parameters: {
          type: 'object',
          properties: {
            city: { type: 'string' },
          },
          required: ['city'],
        },
      },
    },
  ] as OpenAI.Beta.AssistantTool[]

  const openaiAssistant = {
    id: 'multi-tool-assistant',
    object: 'assistant' as const,
    model: 'gpt-4.1-mini',
    instructions:
      'Call get_city_weather for every city requested before responding.',
    description: null,
    name: 'Multi Tool Assistant',
    metadata: {},
    tools,
    created_at: dayjs().unix(),
  }

  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: responsesRunAdapter({
      getOpenaiAssistant: () => openaiAssistant,
    }),
    storage: responsesStorageAdapter(),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content:
      'Please get the current weather for San Francisco and New York City. Call the tool for both cities before replying.',
  })

  const run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: openaiAssistant.id,
    stream: true,
    instructions:
      'Call get_city_weather for every requested city before answering.',
    tools,
  })

  let requiresActionEvent:
    | OpenAI.Beta.AssistantStreamEvent.ThreadRunRequiresAction
    | undefined
  for await (const event of run) {
    if (event.event === 'thread.run.requires_action') {
      requiresActionEvent = event as OpenAI.Beta.AssistantStreamEvent.ThreadRunRequiresAction
      break
    }
  }

  assert.ok(requiresActionEvent, 'Run should require tool outputs')

  const toolCalls =
    requiresActionEvent!.data.required_action?.submit_tool_outputs.tool_calls ??
    []
  assert.ok(toolCalls.length >= 2, 'Expected at least two tool calls')

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

testOrSkip('responsesStorageAdapter works with polling', async (t) => {
  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const openaiAssistant = {
    id: 'some-assistant-id',
    object: 'assistant' as const,
    model: 'gpt-4.1-mini',
    instructions: 'You are a concise, helpful assistant.',
    description: null,
    name: 'Some Assistant',
    metadata: {},
    tools: [],
    created_at: dayjs().unix(),
  }

  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: responsesRunAdapter({
      getOpenaiAssistant: () => openaiAssistant,
    }),
    storage: responsesStorageAdapter(),
  })

  const thread = await client.beta.threads.create()

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
  const text = (
    assistantMessage?.content[0] as OpenAI.Beta.Threads.MessageContentText
  ).text.value.trim()
  assert.equal(text, '4')
})

test('responsesStorageAdapter streams without tool', async (t) => {
  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const openaiAssistant = {
    id: 'some-assistant-id',
    object: 'assistant' as const,
    model: 'gpt-4.1-mini',
    instructions: 'You are a concise, helpful assistant.',
    description: null,
    name: 'Some Assistant',
    metadata: {},
    tools: [],
    created_at: dayjs().unix(),
  }

  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: responsesRunAdapter({
      getOpenaiAssistant: () => openaiAssistant,
    }),
    storage: responsesStorageAdapter(),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Say hello in one short sentence.',
  })

  // No tools; we expect a straight completion (no requires_action)
  const run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: 'unused',
    // assistant_id: assistant.id,
    model: 'gpt-4.1-mini',
    instructions: 'You are a concise, helpful assistant.',
    stream: true,
  })

  // Drain the stream (should reach completed without requires_action)
  let sawCompleted = false
  for await (const event of run) {
    if (event.event === 'thread.run.completed') {
      sawCompleted = true
    }
  }
  assert.ok(sawCompleted, 'Run should complete without requiring action')

  // Poll for the final assistant message (like your original test)
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
  assert.ok(finalText.includes('hello') || finalText.includes('hi'), `Expected greeting, got: ${finalText}`)
})


test('responsesStorageAdapter streams with tool', async (t) => {
  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const openaiAssistant = {
    id: 'some-assistant-id',
    object: 'assistant' as const,
    model: 'gpt-4.1-mini',
    instructions: 'You are a concise, helpful assistant.',
    description: null,
    name: 'Some Assistant',
    metadata: {},
    tools: [],
    created_at: dayjs().unix(),
  }

  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: responsesRunAdapter({
      getOpenaiAssistant: () => openaiAssistant,
    }),
    storage: responsesStorageAdapter(),
  })

  const tools = [
    {
      type: 'function',
      function: {
        name: 'get_current_weather',
        description: 'Get the current weather in a given location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA',
            },
            unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
          },
          required: ['location'],
        },
      },
    },
  ] as OpenAI.Beta.AssistantTool[]

  // const assistant = await client.beta.assistants.create({
  //   model: 'gpt-4o',
  //   instructions: 'You are a helpful assistant.',
  // })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is the weather in SF?',
  })

  const run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: 'unused',
    model: 'gpt-4.1-mini',
    instructions:
      'Use the get_current_weather tool and then answer the message.',
    tools,
    stream: true,
  })

  let requiresActionEvent:
    | OpenAI.Beta.AssistantStreamEvent.ThreadRunRequiresAction
    | undefined
  for await (const event of run) {
    if (event.event === 'thread.run.requires_action') {
      requiresActionEvent = event as OpenAI.Beta.AssistantStreamEvent.ThreadRunRequiresAction
    }
  }

  assert.ok(requiresActionEvent)

  const steps = await client.beta.threads.runs.steps.list(
    requiresActionEvent!.data.id,
    { thread_id: thread.id },
  )
  const toolStep = steps.data.find(
    (s) => s.step_details?.type === 'tool_calls',
  )
  assert.equal(toolStep?.step_details?.tool_calls[0]?.type, 'function')

  const toolCall =
    requiresActionEvent!.data.required_action?.submit_tool_outputs.tool_calls[0]
  assert.ok(toolCall)
  const toolCallId = toolCall?.id

  const submit = await client.beta.threads.runs.submitToolOutputs(
    requiresActionEvent!.data.id,
    {
      thread_id: thread.id,
      tool_outputs: [
        { tool_call_id: toolCallId, output: '70 degrees and sunny.' },
      ],
      stream: true,
    },
  )

  for await (const _event of submit) {
  }

  const listAfter = await client.beta.threads.messages.list(thread.id)

  const latestMessage = listAfter.data[0]

  assert.ok(latestMessage.content[0].text.value.includes('70'))
})

testOrSkip('responsesStorageAdapter exposes run steps with tools', async (t) => {
  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const tools = [
    {
      type: 'function',
      function: {
        name: 'get_current_weather',
        description: 'Get the current weather in a given location',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string' },
          },
          required: ['location'],
        },
      },
    },
  ] as OpenAI.Beta.AssistantTool[]

  const openaiAssistant = {
    id: 'some-assistant-id',
    object: 'assistant' as const,
    model: 'gpt-4.1-mini',
    instructions: 'You are a concise, helpful assistant.',
    description: null,
    name: 'Some Assistant',
    metadata: {},
    tools,
    created_at: dayjs().unix(),
  }

  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: responsesRunAdapter({
      getOpenaiAssistant: () => openaiAssistant,
    }),
    storage: responsesStorageAdapter(),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is the weather in SF?',
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: openaiAssistant.id,
    tools,
  })

  assert.equal(run.status, 'requires_action')

  const steps = await client.beta.threads.runs.steps.list(run.id, {
    thread_id: thread.id,
  })
  const toolStep = steps.data.find(
    (s) => s.step_details?.type === 'tool_calls',
  )
  assert.equal(toolStep?.step_details?.tool_calls[0]?.type, 'function')
})
test('responsesStorageAdapter saves metadata during streaming', async (t) => {
  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const openaiAssistant = {
    id: 'some-assistant-id',
    object: 'assistant' as const,
    model: 'gpt-4.1-mini',
    instructions: 'You are a concise, helpful assistant.',
    description: null,
    name: 'Some Assistant',
    metadata: {},
    tools: [],
    created_at: dayjs().unix(),
  }

  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: responsesRunAdapter({
      getOpenaiAssistant: () => openaiAssistant,
    }),
    storage: responsesStorageAdapter(),
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Say hello in one short sentence.',
  })

  const run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: 'unused',
    model: 'gpt-4.1-mini',
    instructions: 'You are a concise, helpful assistant.',
    stream: true,
  })

  let sawCompleted = false
  for await (const event of run) {
    if (event.event === 'thread.run.completed') {
      sawCompleted = true
    }
  }
  assert.ok(sawCompleted, 'Run should complete')

  // Wait a bit for metadata to be saved (it's in waitUntil)
  await new Promise((r) => setTimeout(r, 2000))

  // Verify that conversation metadata was updated with response items
  const conversation = await realOpenAI.conversations.retrieve(thread.id)

  // The metadata should contain responseItemsMap buckets
  const metadataKeys = Object.keys(conversation.metadata || {})
  const hasResponseItemsMap = metadataKeys.some((key) => key.startsWith('responseItemsMap'))

  assert.ok(
    hasResponseItemsMap,
    `Conversation metadata should contain responseItemsMap after streaming. Found keys: ${metadataKeys.join(', ')}`
  )

  console.log('✅ Metadata saved during streaming:', metadataKeys)
})

test('responsesStorageAdapter handles thread creation with array content', async (t) => {
  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const openaiAssistant = {
    id: `asst_test_${Date.now()}`,
    object: 'assistant' as const,
    created_at: dayjs().unix(),
    name: 'Test Assistant',
    description: null,
    model: 'gpt-4o-mini',
    instructions: 'You are a test assistant',
    tools: [],
    metadata: {},
  }

  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: responsesRunAdapter({
      getOpenaiAssistant: async () => openaiAssistant,
    }),
    storage: responsesStorageAdapter(),
  })

  // Create thread with array content (multiple text parts)
  const thread = await client.beta.threads.create({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello,' },
          { type: 'text', text: ' how are you?' },
        ],
      },
    ],
  })

  assert.ok(thread.id, 'Thread should be created with array content')
  console.log('✅ Thread created with array text content')
})

test('responsesStorageAdapter handles thread creation with multi-part array content', async (t) => {
  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const openaiAssistant = {
    id: `asst_test_${Date.now()}`,
    object: 'assistant' as const,
    created_at: dayjs().unix(),
    name: 'Test Assistant',
    description: null,
    model: 'gpt-4o-mini',
    instructions: 'You are a test assistant',
    tools: [],
    metadata: {},
  }

  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: responsesRunAdapter({
      getOpenaiAssistant: async () => openaiAssistant,
    }),
    storage: responsesStorageAdapter(),
  })

  // Create thread with text content only (testing content format handling)
  // Note: Not testing actual image because OpenAI requires downloadable URLs
  const thread = await client.beta.threads.create({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: ' from array content!' },
        ],
      },
    ],
  })

  assert.ok(thread.id, 'Thread should be created with multi-part array content')
  console.log('✅ Thread created with multi-part array content')
})

test('responsesStorageAdapter handles thread creation with image_url content', async (t) => {
  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const openaiAssistant = {
    id: `asst_test_${Date.now()}`,
    object: 'assistant' as const,
    created_at: dayjs().unix(),
    name: 'Test Assistant',
    description: null,
    model: 'gpt-4o-mini',
    instructions: 'You are a test assistant',
    tools: [],
    metadata: {},
  }

  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: responsesRunAdapter({
      getOpenaiAssistant: async () => openaiAssistant,
    }),
    storage: responsesStorageAdapter(),
  })

  // Use a small, reliable image URL that OpenAI can access
  // This is a 1x1 transparent PNG as a data URL
  const thread = await client.beta.threads.create({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What do you see?' },
          {
            type: 'image_url',
            image_url: {
              url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
              detail: 'low',
            },
          },
        ],
      },
    ],
  })

  assert.ok(thread.id, 'Thread should be created with image_url content')
  console.log('✅ Thread created with image_url content')
})

test('responsesStorageAdapter handles thread creation with mixed text and image content', async (t) => {
  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const openaiAssistant = {
    id: `asst_test_${Date.now()}`,
    object: 'assistant' as const,
    created_at: dayjs().unix(),
    name: 'Test Assistant',
    description: null,
    model: 'gpt-4o-mini',
    instructions: 'You are a test assistant',
    tools: [],
    metadata: {},
  }

  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: responsesRunAdapter({
      getOpenaiAssistant: async () => openaiAssistant,
    }),
    storage: responsesStorageAdapter(),
  })

  // Test with multiple content parts including image
  const thread = await client.beta.threads.create({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'First part, ' },
          { type: 'text', text: 'second part, ' },
          {
            type: 'image_url',
            image_url: {
              url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
              detail: 'low',
            },
          },
          { type: 'text', text: 'and final text.' },
        ],
      },
    ],
  })

  assert.ok(thread.id, 'Thread should be created with mixed text and image content')
  console.log('✅ Thread created with mixed text and image content')
})
