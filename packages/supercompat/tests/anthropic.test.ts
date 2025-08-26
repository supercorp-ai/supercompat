import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import Anthropic from '@anthropic-ai/sdk'
import type OpenAI from 'openai'
import { ProxyAgent, setGlobalDispatcher } from 'undici'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { PrismaClient } from '@prisma/client'
import dns from 'node:dns'
import {
  supercompat,
  anthropicClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from '../src/index'

const anthropicKey = process.env.ANTHROPIC_API_KEY!

dns.setDefaultResultOrder('ipv4first')

if (process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY))
}

test('supercompat can run via Anthropic', async () => {
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

  const assistant = await client.beta.assistants.create({
    model: 'claude-3-5-sonnet-20240620',
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
