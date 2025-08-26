import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import OpenAI from 'openai'
import { ProxyAgent, setGlobalDispatcher } from 'undici'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { createMessageResponse, messagesResponse } from '@superinterface/react/server'
import {
  supercompat,
  openaiClientAdapter,
  responsesRunAdapter,
  openaiResponsesStorageAdapter,
} from '../src/index'

const apiKey = process.env.TEST_OPENAI_API_KEY

if (process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY))
}

test('createMessageResponse processes tool calls without thread id errors', async () => {
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
  ]

  const assistant = await client.beta.assistants.create({
    model: 'gpt-4o',
    instructions:
      'Use the get_current_weather tool and answer with the temperature and unit.',
    tools,
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is the weather in San Francisco, CA?',
  })

  const runStream = await client.beta.threads.runs.create(thread.id, {
    assistant_id: assistant.id,
    stream: true,
  })

  const stream = createMessageResponse({
    client,
    createRunStream: runStream,
    handleToolCall: async ({ toolCall }) => ({
      tool_call_id: toolCall.id,
      output: JSON.stringify({ temperature: '72', unit: 'F' }),
    }),
  })

  const reader = stream.getReader()
  while (!(await reader.read()).done) {}

  const messageList = await messagesResponse({ client, threadId: thread.id })
  const assistantMessage = messageList.data.find(
    (m: any) => m.role === 'assistant',
  )
  assert.ok(
    assistantMessage.content[0].text.value.includes('72'),
    'assistant response missing tool output',
  )

  thread.id = assistantMessage.thread_id

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Thanks!',
  })

  const runStream2 = await client.beta.threads.runs.create(thread.id, {
    assistant_id: assistant.id,
    stream: true,
  })

  const stream2 = createMessageResponse({ client, createRunStream: runStream2 })
  const reader2 = stream2.getReader()
  while (!(await reader2.read()).done) {}

  const followUpList = await messagesResponse({ client, threadId: thread.id })
  const assistantMessages = followUpList.data.filter((m: any) => m.role === 'assistant')
  assert.ok(assistantMessages.length >= 2, 'missing follow-up assistant message')
})
