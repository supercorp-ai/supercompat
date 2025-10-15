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

const apiKey = process.env.TEST_OPENAI_API_KEY

if (process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY))
}

test('responsesRunAdapter can create thread message and run via OpenAI', async (t) => {
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

test('responsesRunAdapter maintains conversation across runs', async (t) => {
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

test('responsesRunAdapter handles multiple simultaneous tool calls', async (t) => {
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

test('responsesStorageAdapter works with polling', async (t) => {
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

test('responsesStorageAdapter exposes run steps with tools', async (t) => {
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
