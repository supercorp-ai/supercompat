import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { post } from '../src/adapters/client/openRouterClientAdapter/completions/post.ts'

// Mock OpenRouter client that returns streaming chunks
const createMockOpenRouter = (chunks: any[]) => ({
  chat: {
    completions: {
      create: async () => ({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield chunk
          }
        },
      }),
    },
  },
})

const makeRequestBody = (model: string) =>
  JSON.stringify({
    model,
    stream: true,
    tools: [
      {
        type: 'computer_use_preview',
        computer_use_preview: {
          display_width: 1280,
          display_height: 720,
        },
      },
    ],
    messages: [{ role: 'user', content: 'take a screenshot' }],
  })

// Collect all computer_call arguments from the SSE response
const collectComputerCallArgs = async (response: Response): Promise<string> => {
  // Read the stream manually since the ReadableStream enqueues strings
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    text += typeof value === 'string' ? value : decoder.decode(value, { stream: true })
  }
  const lines = text.split('\n').filter((l) => l.startsWith('data: '))
  const chunks = lines.map((l) => JSON.parse(l.slice(6)))

  let args = ''
  for (const chunk of chunks) {
    for (const tc of chunk.choices?.[0]?.delta?.tool_calls ?? []) {
      if (tc.function?.arguments) {
        args += tc.function.arguments
      }
    }
  }

  return args
}

test('streaming: complete arguments in the same chunk as name', async () => {
  const mockOpenRouter = createMockOpenRouter([
    {
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'computer_call',
                  arguments: '{"action":{"type":"screenshot"}}',
                },
              },
            ],
          },
        },
      ],
    },
    {
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'tool_calls',
        },
      ],
    },
  ])

  const handler = post({ openRouter: mockOpenRouter as any })
  const response = await handler('http://test', {
    body: makeRequestBody('some/standard-model'),
  })

  const args = await collectComputerCallArgs(response)
  assert.ok(args, 'arguments must not be empty')

  const parsed = JSON.parse(args)
  assert.equal(parsed.action.type, 'screenshot')
})

test('streaming: partial arguments in first chunk, rest in subsequent chunks', async () => {
  const mockOpenRouter = createMockOpenRouter([
    {
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_789',
                type: 'function',
                function: {
                  name: 'computer_call',
                  arguments: '{"action":{"type"',
                },
              },
            ],
          },
        },
      ],
    },
    {
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                function: {
                  arguments: ':"click","x":50,"y":75}}',
                },
              },
            ],
          },
        },
      ],
    },
    {
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'tool_calls',
        },
      ],
    },
  ])

  const handler = post({ openRouter: mockOpenRouter as any })
  const response = await handler('http://test', {
    body: makeRequestBody('some/standard-model'),
  })

  const args = await collectComputerCallArgs(response)
  assert.ok(args, 'arguments must not be empty')

  const parsed = JSON.parse(args)
  assert.equal(parsed.action.type, 'click')
  assert.equal(parsed.action.x, 50)
  assert.equal(parsed.action.y, 75)
})

test('streaming: standard OpenAI format (name first, arguments separate) still works', async () => {
  // Standard OpenAI: first chunk has name with empty args, then args stream separately
  const mockOpenRouter = createMockOpenRouter([
    {
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_std',
                type: 'function',
                function: {
                  name: 'computer_call',
                  arguments: '',
                },
              },
            ],
          },
        },
      ],
    },
    {
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                function: {
                  arguments: '{"action":{"type":"screenshot"}}',
                },
              },
            ],
          },
        },
      ],
    },
    {
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'tool_calls',
        },
      ],
    },
  ])

  const handler = post({ openRouter: mockOpenRouter as any })
  const response = await handler('http://test', {
    body: makeRequestBody('some/standard-model'),
  })

  const args = await collectComputerCallArgs(response)
  assert.ok(args, 'arguments must not be empty')

  const parsed = JSON.parse(args)
  assert.equal(parsed.action.type, 'screenshot')
})
