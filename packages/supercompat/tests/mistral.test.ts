import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import type OpenAI from 'openai'
import { Mistral } from '@mistralai/mistralai'
import { ProxyAgent, setGlobalDispatcher } from 'undici'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { PrismaClient } from '@prisma/client'
import {
  supercompat,
  mistralClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from '../src/index'

const mistralKey = process.env.MISTRAL_API_KEY!

if (process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY))
}

test('supercompat can run via Mistral', async () => {
  const prisma = new PrismaClient()
  const mistral = new Mistral({
    apiKey: mistralKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const client = supercompat({
    client: mistralClientAdapter({ mistral }),
    storage: prismaStorageAdapter({ prisma }),
    runAdapter: completionsRunAdapter(),
  })

  const assistant = await client.beta.assistants.create({
    model: 'mistral-small-latest',
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

test('prismaStorageAdapter exposes run steps with tools via Mistral', async () => {
  const prisma = new PrismaClient()
  const mistral = new Mistral({
    apiKey: mistralKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const client = supercompat({
    client: mistralClientAdapter({ mistral }),
    storage: prismaStorageAdapter({ prisma }),
    runAdapter: completionsRunAdapter(),
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
    model: 'mistral-small-latest',
    instructions: 'Use the get_current_weather and then answer the message.',
    tools,
  })

  const thread = await prisma.thread.create({
    data: { assistantId: assistant.id },
  })

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is the weather in SF?',
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
    tools,
  })

  assert.equal(run.status, 'requires_action')
  const toolCall = run.required_action?.submit_tool_outputs.tool_calls?.[0]
  assert.ok(toolCall)

  const completed = await client.beta.threads.runs.submitToolOutputsAndPoll(
    run.id,
    {
      thread_id: thread.id,
      tool_outputs: [{ tool_call_id: toolCall.id, output: '70 and sunny' }],
    },
  )

  assert.equal(completed.status, 'completed')

  const steps = await client.beta.threads.runs.steps.list(run.id, {
    thread_id: thread.id,
  })
  const toolStep = steps.data.find(
    (s) => s.step_details?.type === 'tool_calls'
  )
  assert.equal(toolStep?.step_details?.tool_calls[0]?.type, 'function')

  await prisma.$disconnect()
})
