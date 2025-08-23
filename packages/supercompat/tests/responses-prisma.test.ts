import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import OpenAI from 'openai'
import { ProxyAgent, setGlobalDispatcher } from 'undici'
import { HttpsProxyAgent } from 'https-proxy-agent'
import {
  responsesRunAdapter,
  openaiClientAdapter,
  supercompat,
  prismaStorageAdapter,
} from '../src/index'
import { PrismaClient } from '@prisma/client'

const apiKey = process.env.TEST_OPENAI_API_KEY
const dbUrl = process.env.DATABASE_URL

if (process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY))
}

if (!dbUrl) {
  test('responsesRunAdapter with prisma storage can poll and handle tools', { skip: true }, () => {})
  test('responsesRunAdapter with prisma storage streams and handles tools', { skip: true }, () => {})
} else {
  test('responsesRunAdapter with prisma storage can poll and handle tools', async () => {
    const prisma = new PrismaClient()
  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: responsesRunAdapter(),
    storage: prismaStorageAdapter({ prisma }),
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
    content: 'What is the weather in SF?'
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
    model: 'gpt-4o',
    instructions: 'Use the get_current_weather and then answer the message.',
    tools,
  })

  if (!run.required_action) {
    throw new Error('No requires action event')
  }

  const toolCallId = run.required_action.submit_tool_outputs.tool_calls[0].id

  await client.beta.threads.runs.submitToolOutputs(thread.id, run.id, {
    tool_outputs: [
      {
        tool_call_id: toolCallId,
        output: '70 degrees and sunny.',
      },
    ],
  })

  const list = await client.beta.threads.messages.list(thread.id)
  const assistantMessage = list.data.filter(m => m.role === 'assistant').at(-1)
  const text = (
    assistantMessage?.content[0] as OpenAI.Beta.Threads.MessageContentText
  ).text.value.toLowerCase()
  assert.ok(text.includes('70 degrees'))

  const dbThread = await prisma.thread.findUnique({ where: { id: thread.id } })
  assert.ok(dbThread?.openaiConversationId)
  await prisma.$disconnect()
  })

  test('responsesRunAdapter with prisma storage streams and handles tools', async () => {
    const prisma = new PrismaClient()
  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: responsesRunAdapter(),
    storage: prismaStorageAdapter({ prisma }),
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
    content: 'What is the weather in SF?'
  })

  const run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: assistant.id,
    model: 'gpt-4o',
    instructions: 'Use the get_current_weather tool and then answer the message.',
    stream: true,
    tools,
  })

  let requiresActionEvent: OpenAI.Beta.AssistantStreamEvent.ThreadRunRequiresAction | undefined
  for await (const event of run) {
    if (event.event === 'thread.run.requires_action') {
      requiresActionEvent = event
    }
  }

  assert.ok(requiresActionEvent)

  const toolCallId = requiresActionEvent!.data.required_action?.submit_tool_outputs.tool_calls[0].id

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

  for await (const _ of submit) {
  }

  const list = await client.beta.threads.messages.list(thread.id)
  const assistantMessage = list.data.filter(m => m.role === 'assistant').at(-1)
  const text = (
    assistantMessage?.content[0] as OpenAI.Beta.Threads.MessageContentText
  ).text.value.toLowerCase()
  assert.ok(text.includes('70 degrees'))

  const dbThread = await prisma.thread.findUnique({ where: { id: thread.id } })
  assert.ok(dbThread?.openaiConversationId)
    await prisma.$disconnect()
  })
}
