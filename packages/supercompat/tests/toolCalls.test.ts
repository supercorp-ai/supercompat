import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import OpenAI from 'openai'
import { PrismaClient } from '@prisma/client'
import { ProxyAgent, setGlobalDispatcher } from 'undici'
import { HttpsProxyAgent } from 'https-proxy-agent'
import dns from 'node:dns'
import {
  supercompat,
  openaiClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from '../src/index'

dns.setDefaultResultOrder('ipv4first')

if (process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY))
}

const apiKey = process.env.TEST_OPENAI_API_KEY!

test('completions run adapter surfaces tool calls', async () => {
  const prisma = new PrismaClient()
  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
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
  ]

  const assistant = await client.beta.assistants.create({
    model: 'gpt-4o-mini',
    instructions: 'Use the get_current_weather and then answer the message.',
    tools,
  })

  const thread = await prisma.thread.create({
    data: { assistantId: assistant.id },
  })

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is the weather in San Francisco, CA?',
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
      tool_outputs: [
        {
          tool_call_id: toolCall.id,
          output: JSON.stringify({ temperature: '72', unit: 'F' }),
        },
      ],
    }
  )

  assert.equal(completed.status, 'completed')

  const list = await client.beta.threads.messages.list(thread.id)
  const assistantMessage = list.data
    .filter((m) => m.role === 'assistant')
    .at(-1)

  assert.ok(assistantMessage?.metadata?.toolCalls?.[0])

  await prisma.$disconnect()
})
