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
    model: 'claude-haiku-4-5-20251001',
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
    model: 'claude-haiku-4-5-20251001',
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

test('completions run adapter surfaces anthropic web search tool calls', async () => {
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
      type: 'web_search_20250305',
      web_search_20250305: { name: 'web_search' },
    },
  ] as unknown as OpenAI.Beta.AssistantTool[]

  const assistant = await client.beta.assistants.create({
    model: 'claude-haiku-4-5-20251001',
    instructions:
      'You are a helpful assistant that must call the web_search tool before responding.',
    tools,
  })

  const thread = await prisma.thread.create({
    data: { assistantId: assistant.id },
  })

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content:
      'Find the latest NASA launch news. Call the web_search tool before answering and then summarize the result.',
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
    tools,
    instructions:
      'Always invoke the web_search tool first, then reply with a concise summary.',
  })

  assert.equal(run.status, 'completed')

  const steps = await client.beta.threads.runs.steps.list(run.id, {
    thread_id: thread.id,
  })

  const toolStep = steps.data.find(
    (step) => step.step_details?.type === 'tool_calls'
  )

  assert.ok(toolStep)
  assert.equal(toolStep.status, 'completed')
  assert.ok(toolStep.completed_at)
  const webSearchToolCall = toolStep.step_details?.tool_calls[0]
  assert.ok(webSearchToolCall)
  assert.equal(webSearchToolCall.type, 'function')
  assert.equal(
    webSearchToolCall.function?.name,
    'web_search'
  )
  const toolArguments = webSearchToolCall.function?.arguments ?? ''
  assert.ok(toolArguments.length > 0)
  const normalizedArgs = toolArguments.toLowerCase()
  assert.ok(normalizedArgs.includes('query'))
  assert.ok(webSearchToolCall.function?.output)
  const parsedOutput = JSON.parse(webSearchToolCall.function!.output!)
  assert.ok(Array.isArray(parsedOutput.content))
  assert.equal(
    Object.prototype.hasOwnProperty.call(parsedOutput, 'tool_use_id'),
    false
  )
  const firstResult = parsedOutput.content[0] as Record<string, unknown>
  assert.equal(firstResult?.type, 'web_search_result')

  await prisma.$disconnect()
})
