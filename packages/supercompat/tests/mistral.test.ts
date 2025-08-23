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

  await prisma.$disconnect()
})
