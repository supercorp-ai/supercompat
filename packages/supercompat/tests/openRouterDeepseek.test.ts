import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import OpenAI from 'openai'
import { PrismaClient } from '@prisma/client'
import { HttpsProxyAgent } from 'https-proxy-agent'
import {
  supercompat,
  openRouterClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from '../src/index.ts'

const openrouterApiKey = process.env.OPENROUTER_API_KEY

if (!openrouterApiKey) {
  throw new Error('OPENROUTER_API_KEY is required to run this test')
}

const MODEL = 'deepseek/deepseek-chat-v3.1'

function makeOpenRouter() {
  return new OpenAI({
    apiKey: openrouterApiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })
}

// =========================================================================
// 1. Basic chat completion (non-streaming)
// =========================================================================
test('openRouter DeepSeek: basic chat completion', async () => {
  const client = supercompat({
    client: openRouterClientAdapter({ openRouter: makeOpenRouter() }),
  })

  const result = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: 'What is 2 + 2? Reply with just one number and nothing else.',
      },
    ],
  })

  const choices =
    'choices' in result ? result.choices : (result as any).data.choices
  const message = choices[0]?.message?.content?.trim()
  assert.equal(message, '4')
})

// =========================================================================
// 2. Streaming chat completion
// =========================================================================
test('openRouter DeepSeek: streaming chat completion', async () => {
  const client = supercompat({
    client: openRouterClientAdapter({ openRouter: makeOpenRouter() }),
  })

  const stream = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: 'What is 2 + 2? Reply with just one number and nothing else.',
      },
    ],
    stream: true,
  })

  let content = ''
  for await (const chunk of stream as any) {
    const delta = chunk.choices?.[0]?.delta?.content
      ?? chunk.choices?.[0]?.delta?.reasoning_content
    if (delta) content += delta
  }

  assert.ok(content.trim().includes('4'), `Expected "4" in "${content.trim()}"`)
})

// =========================================================================
// 3. Tool calling (direct completions)
// =========================================================================
test.skip('openRouter DeepSeek: tool calling', async () => {
  const client = supercompat({
    client: openRouterClientAdapter({ openRouter: makeOpenRouter() }),
  })

  const tools: OpenAI.ChatCompletionTool[] = [
    {
      type: 'function',
      function: {
        name: 'get_account_balance',
        description: 'Look up the account balance for a given user ID in the billing database',
        parameters: {
          type: 'object',
          properties: {
            user_id: { type: 'string', description: 'The user ID to look up' },
          },
          required: ['user_id'],
        },
      },
    },
  ]

  const result = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: 'You are a billing assistant. You can ONLY look up information by calling functions. You have no data yourself.',
      },
      {
        role: 'user',
        content: 'What is the account balance for user ID usr_abc123?',
      },
    ],
    tools,
  })

  const choices =
    'choices' in result ? result.choices : (result as any).data.choices
  const toolCalls = choices[0]?.message?.tool_calls
  assert.ok(toolCalls && toolCalls.length > 0, 'Expected tool_calls in response')
  assert.equal(toolCalls[0].function.name, 'get_account_balance')
})

// =========================================================================
// 4. Thread/run via completionsRunAdapter
// =========================================================================
test('openRouter DeepSeek: thread/run via completionsRunAdapter', async () => {
  const prisma = new PrismaClient()

  const client = supercompat({
    client: openRouterClientAdapter({ openRouter: makeOpenRouter() }),
    storage: prismaStorageAdapter({ prisma }),
    runAdapter: completionsRunAdapter(),
  })

  const assistant = await client.beta.assistants.create({
    model: MODEL,
    instructions: 'You are a helpful assistant.',
  })

  const thread = await prisma.thread.create({
    data: { assistantId: assistant.id },
  })

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

  await prisma.$disconnect()
})

// =========================================================================
// 5. Thread/run with tool calling
// =========================================================================
test.skip('openRouter DeepSeek: thread/run with tool calling', async () => {
  const prisma = new PrismaClient()

  const client = supercompat({
    client: openRouterClientAdapter({ openRouter: makeOpenRouter() }),
    storage: prismaStorageAdapter({ prisma }),
    runAdapter: completionsRunAdapter(),
  })

  const tools = [
    {
      type: 'function',
      function: {
        name: 'get_account_balance',
        description: 'Look up the account balance for a given user ID in the billing database',
        parameters: {
          type: 'object',
          properties: {
            user_id: { type: 'string', description: 'The user ID to look up' },
          },
          required: ['user_id'],
        },
      },
    },
  ] as OpenAI.Beta.AssistantTool[]

  const assistant = await client.beta.assistants.create({
    model: MODEL,
    instructions: 'You are a billing assistant. You can ONLY look up information by calling functions. You have no data yourself.',
    tools,
  })

  const thread = await prisma.thread.create({
    data: { assistantId: assistant.id },
  })

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is the account balance for user ID usr_abc123?',
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
    tools,
  })

  assert.equal(run.status, 'requires_action')
  const toolCall = run.required_action?.submit_tool_outputs.tool_calls?.[0]
  assert.ok(toolCall)

  let current = await client.beta.threads.runs.submitToolOutputsAndPoll(
    run.id,
    {
      thread_id: thread.id,
      tool_outputs: [{ tool_call_id: toolCall.id, output: '$42.50' }],
    },
  )

  for (let i = 0; i < 10 && current.status === 'requires_action'; i++) {
    const nextToolCall = current.required_action?.submit_tool_outputs.tool_calls?.[0]
    assert.ok(nextToolCall)
    current = await client.beta.threads.runs.submitToolOutputsAndPoll(
      current.id,
      {
        thread_id: thread.id,
        tool_outputs: [{ tool_call_id: nextToolCall.id, output: '$42.50' }],
      },
    )
  }

  assert.equal(current.status, 'completed')

  await prisma.$disconnect()
})

// =========================================================================
// 6. Models list
// =========================================================================
test('openRouter DeepSeek: models list', async () => {
  const client = supercompat({
    client: openRouterClientAdapter({ openRouter: makeOpenRouter() }),
  })

  const models = [] as string[]
  const response = await client.models.list()
  for await (const model of response) {
    models.push(model.id)
  }

  assert.ok(models.length > 0)
})
