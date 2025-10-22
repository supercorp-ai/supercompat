import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import OpenAI from 'openai'
import { PrismaClient } from '@prisma/client'
import dns from 'node:dns'
import { ProxyAgent, setGlobalDispatcher } from 'undici'
import { HttpsProxyAgent } from 'https-proxy-agent'
import {
  supercompat,
  googleClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from '../src/index'

dns.setDefaultResultOrder('ipv4first')

if (process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY))
}

const googleKey = process.env.GOOGLE_API_KEY

const createGoogleClient = () => {
  const prisma = new PrismaClient()
  const google = new OpenAI({
    apiKey: googleKey,
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const client = supercompat({
    client: googleClientAdapter({ google }),
    storage: prismaStorageAdapter({ prisma }),
    runAdapter: completionsRunAdapter(),
  })

  return { client, prisma }
}

if (!googleKey) {
  test.skip('requires GOOGLE_API_KEY for Google adapter tests', () => {})
  test.skip('requires GOOGLE_API_KEY for Google chat completions test', () => {})
} else {
  test('supercompat lists Google models via google adapter', async () => {
    const { client, prisma } = createGoogleClient()

    try {
      const response = await client.models.list()
      assert.ok(response)
      assert.equal(response.object, 'list')
      assert.ok(Array.isArray(response.data))
      assert.ok(response.data.length > 0)
      assert.ok(
        response.data.every(
          (model: any) => typeof model?.id === 'string' && model.id.length > 0,
        ),
      )
    } finally {
      await prisma.$disconnect()
    }
  })

  test('google adapter handles basic chat.completions without tools', async () => {
    const { client, prisma } = createGoogleClient()

    try {
      const completion = await client.chat.completions.create({
        model: 'gemini-2.0-flash',
        max_tokens: 64,
        messages: [
          {
            role: 'system',
            content: 'You are a concise assistant that replies in one sentence.',
          },
          {
            role: 'user',
            content: 'Say hi and mention you are using Gemini.',
          },
        ],
      })

      assert.ok(completion)
      const result = (completion as any).data ?? completion
      const choice = result.choices?.[0]
      assert.ok(choice)
      assert.equal(choice.finish_reason, 'stop')
      const messageContent = choice.message?.content
      assert.ok(typeof messageContent === 'string' && messageContent.length > 0)
    } finally {
      await prisma.$disconnect()
    }
  })
}
