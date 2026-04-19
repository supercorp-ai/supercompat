import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import { post } from '../../../src/adapters/client/ollamaClientAdapter/completions/post.ts'

// Mock Ollama client — the adapter calls `ollama.chat.completions.create(body)`
// which in streaming mode must return an async iterable of SSE-style chunks.
const createMockOllama = (chunks: any[]) => {
  async function* iter() {
    for (const c of chunks) yield c
  }

  return {
    chat: {
      completions: {
        create: async () => iter(),
      },
    },
  } as any
}

const makeRequestBody = (model: string) =>
  JSON.stringify({
    model,
    stream: true,
    tools: [
      {
        type: 'computer_use_preview',
        computer_use_preview: { display_width: 1280, display_height: 720 },
      },
    ],
    messages: [{ role: 'user', content: 'take a screenshot' }],
  })

// Collect all computer_call arguments from the SSE response returned by post()
const collectComputerCallArgs = async (response: Response): Promise<string> => {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    text += typeof value === 'string' ? value : decoder.decode(value, { stream: true })
  }
  const lines = text.split('\n').filter((l) => l.startsWith('data: '))
  const parsed = lines.map((l) => JSON.parse(l.slice(6)))

  let args = ''
  for (const chunk of parsed) {
    for (const tc of chunk.choices?.[0]?.delta?.tool_calls ?? []) {
      if (tc.function?.arguments) args += tc.function.arguments
    }
  }
  return args
}

describe('ollama streaming computer_call', { concurrency: true }, () => {
test('streaming: complete arguments in the same chunk as name (gemma denormalizes)', async () => {
  const mock = createMockOllama([
    {
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'computer_call',
                  // 500, 500 in normalized 0-1000 → 640, 360 at 1280x720
                  arguments: '{"action":{"type":"click","x":500,"y":500}}',
                },
              },
            ],
          },
        },
      ],
    },
    { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
  ])

  const handler = post({ ollama: mock })
  const response = await handler('http://test', { body: makeRequestBody('gemma4:26b') })

  const args = await collectComputerCallArgs(response)
  assert.ok(args, 'arguments must not be empty')
  const parsed = JSON.parse(args)
  assert.equal(parsed.action.type, 'click')
  assert.equal(parsed.action.x, 640)
  assert.equal(parsed.action.y, 360)
})

test('streaming: partial arguments in first chunk, rest in subsequent chunks', async () => {
  const mock = createMockOllama([
    {
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_2',
                type: 'function',
                function: { name: 'computer_call', arguments: '{"action":{"type"' },
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
              { index: 0, function: { arguments: ':"click","x":250,"y":500}}' } },
            ],
          },
        },
      ],
    },
    { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
  ])

  const handler = post({ ollama: mock })
  const response = await handler('http://test', { body: makeRequestBody('gemma4:26b') })

  const args = await collectComputerCallArgs(response)
  const parsed = JSON.parse(args)
  assert.equal(parsed.action.type, 'click')
  assert.equal(parsed.action.x, 320) // 250/1000 * 1280
  assert.equal(parsed.action.y, 360) // 500/1000 * 720
})

test('streaming: standard OpenAI format (name first, args separate) works', async () => {
  const mock = createMockOllama([
    {
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_3',
                type: 'function',
                function: { name: 'computer_call', arguments: '' },
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
              { index: 0, function: { arguments: '{"action":{"type":"screenshot"}}' } },
            ],
          },
        },
      ],
    },
    { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
  ])

  const handler = post({ ollama: mock })
  const response = await handler('http://test', { body: makeRequestBody('gemma4:26b') })

  const args = await collectComputerCallArgs(response)
  const parsed = JSON.parse(args)
  assert.equal(parsed.action.type, 'screenshot')
})

test('streaming: generic model passes pixel coords through without rescaling', async () => {
  const mock = createMockOllama([
    {
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_4',
                type: 'function',
                function: {
                  name: 'computer_call',
                  arguments: '{"action":{"type":"click","x":640,"y":360}}',
                },
              },
            ],
          },
        },
      ],
    },
    { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
  ])

  const handler = post({ ollama: mock })
  const response = await handler('http://test', { body: makeRequestBody('llama3.2') })

  const args = await collectComputerCallArgs(response)
  const parsed = JSON.parse(args)
  assert.equal(parsed.action.x, 640)
  assert.equal(parsed.action.y, 360)
})

test('streaming: fuzzy fallback flushes truncated JSON at end-of-stream', async () => {
  const mock = createMockOllama([
    {
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_5',
                type: 'function',
                function: {
                  name: 'computer_call',
                  // Malformed truncated JSON — never fully parses, flushed at end
                  arguments: '{"type": "click", "x": [168, 621]',
                },
              },
            ],
          },
        },
      ],
    },
    { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
  ])

  const handler = post({ ollama: mock })
  const response = await handler('http://test', { body: makeRequestBody('qwen2.5vl:32b') })

  const args = await collectComputerCallArgs(response)
  assert.ok(args, 'flush path must emit arguments for fuzzy-fallback models')
  const parsed = JSON.parse(args)
  assert.equal(parsed.action.type, 'click')
  assert.equal(parsed.action.x, 168)
  assert.equal(parsed.action.y, 621)
})

test('streaming: non-tool chunks pass through untouched', async () => {
  const mock = createMockOllama([
    { choices: [{ index: 0, delta: { content: 'Hello' } }] },
    { choices: [{ index: 0, delta: { content: ' world' } }] },
    { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
  ])

  const handler = post({ ollama: mock })
  const response = await handler('http://test', { body: makeRequestBody('gemma4:26b') })

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    text += typeof value === 'string' ? value : decoder.decode(value, { stream: true })
  }

  const lines = text.split('\n').filter((l) => l.startsWith('data: '))
  const contents = lines
    .map((l) => JSON.parse(l.slice(6)))
    .map((c) => c.choices?.[0]?.delta?.content)
    .filter(Boolean)
    .join('')

  assert.equal(contents, 'Hello world')
})
})
