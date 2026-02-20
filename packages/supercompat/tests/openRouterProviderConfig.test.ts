import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { post } from '../src/adapters/client/openRouterClientAdapter/completions/post.ts'

const completionResponse = {
  id: 'chatcmpl-123',
  object: 'chat.completion',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: 'Hello!' },
      finish_reason: 'stop',
    },
  ],
}

const createMockOpenRouter = (opts: {
  onRequest?: (body: Record<string, unknown>) => void
}) => ({
  _options: {
    apiKey: 'test-key',
    httpClient: {
      request: async (req: Request) => {
        const body = await req.json()
        opts.onRequest?.(body)
        return new Response(JSON.stringify(completionResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
  _baseURL: new URL('https://openrouter.ai/api/v1'),
})

test('non-streaming: provider config from adapter is included in request body', async () => {
  let capturedBody: Record<string, unknown> | null = null

  const mockOpenRouter = createMockOpenRouter({
    onRequest: (body) => { capturedBody = body },
  })

  const handler = post({
    openRouter: mockOpenRouter as any,
    provider: { sort: 'throughput' },
  })
  await handler('http://test', {
    body: JSON.stringify({
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'Hi' }],
    }),
  })

  assert.ok(capturedBody, 'Request should have been made')
  assert.deepEqual(capturedBody!.provider, { sort: 'throughput' }, 'provider config should be in request body')
})

test('non-streaming: per-request provider config is NOT overwritten by adapter default', async () => {
  let capturedBody: Record<string, unknown> | null = null

  const mockOpenRouter = createMockOpenRouter({
    onRequest: (body) => { capturedBody = body },
  })

  const handler = post({
    openRouter: mockOpenRouter as any,
    provider: { sort: 'throughput' },
  })
  await handler('http://test', {
    body: JSON.stringify({
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'Hi' }],
      provider: { sort: 'price' },
    }),
  })

  assert.ok(capturedBody, 'Request should have been made')
  assert.deepEqual(capturedBody!.provider, { sort: 'price' }, 'per-request provider should take precedence')
})

test('non-streaming: no provider config when adapter has none', async () => {
  let capturedBody: Record<string, unknown> | null = null

  const mockOpenRouter = createMockOpenRouter({
    onRequest: (body) => { capturedBody = body },
  })

  const handler = post({ openRouter: mockOpenRouter as any })
  await handler('http://test', {
    body: JSON.stringify({
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'Hi' }],
    }),
  })

  assert.ok(capturedBody, 'Request should have been made')
  assert.equal(capturedBody!.provider, undefined, 'provider should not be set')
})

test('streaming: provider config from adapter is included in request body', async () => {
  let capturedBody: Record<string, unknown> | null = null

  const sseBody = `data: ${JSON.stringify({
    choices: [{ index: 0, delta: { content: 'Hi' } }],
  })}\n\ndata: [DONE]\n\n`

  const mockOpenRouter = {
    _options: {
      apiKey: 'test-key',
      httpClient: {
        request: async (req: Request) => {
          capturedBody = await req.json()
          return new Response(sseBody, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          })
        },
      },
    },
    _baseURL: new URL('https://openrouter.ai/api/v1'),
  }

  const handler = post({
    openRouter: mockOpenRouter as any,
    provider: { sort: 'throughput' },
  })
  const response = await handler('http://test', {
    body: JSON.stringify({
      model: 'openai/gpt-4o',
      stream: true,
      messages: [{ role: 'user', content: 'Hi' }],
    }),
  })

  // Consume the stream
  const reader = response.body!.getReader()
  while (!(await reader.read()).done) {}

  assert.ok(capturedBody, 'Request should have been made')
  assert.deepEqual(capturedBody!.provider, { sort: 'throughput' }, 'provider config should be in streaming request body')
})
