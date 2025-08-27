import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import Anthropic from '@anthropic-ai/sdk'
import type OpenAI from 'openai'
import { PrismaClient } from '@prisma/client'
import { ProxyAgent, setGlobalDispatcher } from 'undici'
import { HttpsProxyAgent } from 'https-proxy-agent'
import dns from 'node:dns'
import {
  supercompat,
  anthropicClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from '../src/index'

dns.setDefaultResultOrder('ipv4first')

if (process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY))
}

const anthropicKey = process.env.ANTHROPIC_API_KEY!

test('completions run adapter surfaces anthropic tool calls', async () => {
  const prisma = new PrismaClient()
  const anthropic = new Anthropic({
    apiKey: anthropicKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const client = supercompat({
    client: anthropicClientAdapter({ anthropic }),
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
    model: 'claude-3-5-sonnet-20240620',
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

  const run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: assistant.id,
    instructions: 'Use the get_current_weather and then answer the message.',
    model: 'claude-3-5-sonnet-20240620',
    tools,
    stream: true,
    truncation_strategy: {
      type: 'last_messages',
      last_messages: 10,
    },
  })

  let requiresActionEvent:
    | OpenAI.Beta.AssistantStreamEvent.ThreadRunRequiresAction
    | undefined

  for await (const event of run) {
    if (event.event === 'thread.run.requires_action') {
      requiresActionEvent =
        event as OpenAI.Beta.AssistantStreamEvent.ThreadRunRequiresAction
    }
  }

  assert.ok(requiresActionEvent)

  const toolCallId =
    requiresActionEvent.data.required_action?.submit_tool_outputs.tool_calls[0]
      .id

  const submit = await client.beta.threads.runs.submitToolOutputs(
    requiresActionEvent.data.id,
    {
      thread_id: thread.id,
      stream: true,
      tool_outputs: [
        {
          tool_call_id: toolCallId,
          output: '70 degrees and sunny.',
        },
      ],
    }
  )

  for await (const _event of submit) {
  }

  const list = await client.beta.threads.messages.list(thread.id)
  const assistantMessage = list.data
    .filter((m) => m.role === 'assistant')
    .at(-1)

  assert.ok(assistantMessage?.metadata?.toolCalls?.[0])

  await prisma.$disconnect()
})
