import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import OpenAI from 'openai'
import { ProxyAgent, setGlobalDispatcher } from 'undici'
import { HttpsProxyAgent } from 'https-proxy-agent'
import {
  responsesRunAdapter,
  openaiClientAdapter,
  supercompat,
  openaiResponsesStorageAdapter,
} from '../src/index'

const apiKey = process.env.TEST_OPENAI_API_KEY

if (process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY))
}

test('responsesRunAdapter streams multiple messages in same thread', async () => {
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

  const assistant = await client.beta.assistants.create({
    model: 'gpt-4o-mini',
    instructions: 'You are a helpful assistant.',
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Hello',
  })

  const run1 = await client.beta.threads.runs.create(thread.id, {
    assistant_id: assistant.id,
    stream: true,
  })

  for await (const _event of run1) {
  }

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Give me a short greeting',
  })

  const run2 = await client.beta.threads.runs.create(thread.id, {
    assistant_id: assistant.id,
    stream: true,
  })

  for await (const _event of run2) {
  }

  const list = await client.beta.threads.messages.list(thread.id)
  const assistantMessages = list.data.filter((m) => m.role === 'assistant')
  assert.ok(assistantMessages.length >= 2)
  const secondAssistant = assistantMessages.at(-1)
  const text = (
    secondAssistant?.content[0] as OpenAI.Beta.Threads.MessageContentText
  ).text.value
    .trim()
  assert.ok(text.length > 0)
  assert.notEqual(
    secondAssistant?.id,
    'THERE_IS_A_BUG_IN_SUPERCOMPAT_IF_YOU_SEE_THIS_ID',
  )
})
