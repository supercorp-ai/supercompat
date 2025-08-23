import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { ProxyAgent, setGlobalDispatcher } from 'undici'
import { HttpsProxyAgent } from 'https-proxy-agent'
import {
  supercompat,
  anthropicClientAdapter,
  openaiResponsesStorageAdapter,
  completionsRunAdapter,
} from '../src/index'

const openaiKey = process.env.TEST_OPENAI_API_KEY
const anthropicKey = process.env.ANTHROPIC_API_KEY

if (process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY))
}

if (!anthropicKey) {
  test.skip('supercompat can run via Anthropic', () => {})
} else
  test('supercompat can run via Anthropic', async () => {
    const storageOpenAI = new OpenAI({
      apiKey: openaiKey,
      ...(process.env.HTTPS_PROXY
        ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
        : {}),
    })

    const anthropic = new Anthropic({
      apiKey: anthropicKey,
      ...(process.env.HTTPS_PROXY
        ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
        : {}),
    })

    const assistant = await storageOpenAI.beta.assistants.create({
      model: 'gpt-4o-mini',
      instructions: 'You are a helpful assistant.',
    })

    const client = supercompat({
      client: anthropicClientAdapter({ anthropic }),
      storage: openaiResponsesStorageAdapter({ openai: storageOpenAI }),
      runAdapter: completionsRunAdapter(),
    })

    const thread = await client.beta.threads.create()

    await client.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: 'What is 2 + 2? Reply with just one number and nothing else.',
    })

    await client.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistant.id,
      model: 'claude-3-5-sonnet-20240620',
    })

    const list = await client.beta.threads.messages.list(thread.id)
    const assistantMessage = list.data
      .filter((m) => m.role === 'assistant')
      .at(-1)
    const text = (
      assistantMessage?.content[0] as OpenAI.Beta.Threads.MessageContentText
    ).text.value.trim()
    assert.equal(text, '4')
  })
