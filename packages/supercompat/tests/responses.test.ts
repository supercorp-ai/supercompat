import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import OpenAI from 'openai'
import { ProxyAgent, setGlobalDispatcher } from 'undici'
import { HttpsProxyAgent } from 'https-proxy-agent'
import {
  responsesRunAdapter,
  openaiClientAdapter,
  supercompat,
  openaiResponsesStorageAdapter,
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

  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: responsesRunAdapter(),
    storage: openaiResponsesStorageAdapter({ openai: realOpenAI }),
  })

  const assistant = await client.beta.assistants.create({
    model: 'gpt-4o',
    instructions: 'You are a helpful assistant.',
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is 2 + 2? Reply with just one number and nothing else.',
  })

  await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
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

  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: responsesRunAdapter(),
    storage: openaiResponsesStorageAdapter({ openai: realOpenAI }),
  })

  const assistant = await client.beta.assistants.create({
    model: 'gpt-4o',
    instructions: 'You are a helpful assistant.',
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'My favorite color is blue.',
  })

  await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
  })

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is my favorite color?',
  })

  await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
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

test('responsesRunAdapter can stream run with tool via OpenAI', async (t) => {
  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: responsesRunAdapter(),
    storage: openaiResponsesStorageAdapter({ openai: realOpenAI }),
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

  const assistant = await client.beta.assistants.create({
    model: 'gpt-4o',
    instructions: 'You are a helpful assistant.',
    tools,
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is the weather in SF?',
  })

  const run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: assistant.id,
    instructions:
      'Use the get_current_weather tool and then answer the message.',
  })

  const runStatus = await client.beta.threads.runs.retrieve(run.id, {
    thread_id: thread.id,
  })
  assert.equal(runStatus.status, 'requires_action')

  const toolCall =
    runStatus.required_action?.submit_tool_outputs.tool_calls[0]
  assert.ok(toolCall)
  const toolCallId = toolCall?.id

  const submit = await client.beta.threads.runs.submitToolOutputs(run.id, {
    thread_id: thread.id,
    tool_outputs: [
      { tool_call_id: toolCallId, output: '70 degrees and sunny.' },
    ],
    stream: true,
  })

  let completedRun: OpenAI.Beta.Threads.Run | undefined
  for await (const event of submit) {
    if (event.event === 'thread.run.completed') {
      completedRun = event.data as OpenAI.Beta.Threads.Run
    }
  }
  assert.equal(completedRun?.status, 'completed')


  const listAfter = await client.beta.threads.messages.list(thread.id)
  const finalAssistant = listAfter.data
    .filter((m) => m.role === 'assistant')
    .at(-1)
  const finalText = (
    finalAssistant?.content[0] as OpenAI.Beta.Threads.MessageContentText
  ).text.value
    .trim()
    .toLowerCase()
  assert.ok(finalText.includes('70'))
})

test('openaiResponsesStorageAdapter works with polling', async (t) => {
  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: responsesRunAdapter(),
    storage: openaiResponsesStorageAdapter({ openai: realOpenAI }),
  })

  const assistant = await client.beta.assistants.create({
    model: 'gpt-4o-mini',
    instructions: 'You are a helpful assistant.',
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is 2 + 2? Reply with just one number and nothing else.',
  })

  await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
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

test('openaiResponsesStorageAdapter streams with tool', async (t) => {
  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: responsesRunAdapter(),
    storage: openaiResponsesStorageAdapter({ openai: realOpenAI }),
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

  const assistant = await client.beta.assistants.create({
    model: 'gpt-4o',
    instructions: 'You are a helpful assistant.',
    tools,
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is the weather in SF?',
  })

  const run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: assistant.id,
    instructions:
      'Use the get_current_weather tool and then answer the message.',
  })

  let runStatus = await client.beta.threads.runs.retrieve(run.id, {
    thread_id: thread.id,
  })
  assert.equal(runStatus.status, 'requires_action')

  const toolCall =
    runStatus.required_action?.submit_tool_outputs.tool_calls[0]
  assert.ok(toolCall)
  const toolCallId = toolCall?.id

  await client.beta.threads.runs.submitToolOutputs(run.id, {
    thread_id: thread.id,
    tool_outputs: [
      { tool_call_id: toolCallId, output: '70 degrees and sunny.' },
    ],
    stream: true,
  })

  runStatus = await client.beta.threads.runs.retrieve(run.id, {
    thread_id: thread.id,
  })
  assert.equal(runStatus.status, 'completed')


  const listAfter = await client.beta.threads.messages.list(thread.id)
  const finalAssistant = listAfter.data
    .filter((m) => m.role === 'assistant')
    .at(-1)
  const finalText = (
    finalAssistant?.content[0] as OpenAI.Beta.Threads.MessageContentText
  ).text.value
    .trim()
    .toLowerCase()
  assert.ok(finalText.includes('70'))
})

test('openaiResponsesStorageAdapter exposes run steps with tools', async (t) => {
  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: responsesRunAdapter(),
    storage: openaiResponsesStorageAdapter({ openai: realOpenAI }),
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

  const assistant = await client.beta.assistants.create({
    model: 'gpt-4o',
    instructions: 'Use the get_current_weather and then answer the message.',
    tools,
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is the weather in SF?',
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
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
