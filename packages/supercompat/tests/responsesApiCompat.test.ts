import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import OpenAI from 'openai'
import { PrismaClient } from '@prisma/client'
import {
  createClient,
  openaiClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from '../src/openaiResponses/index'

const apiKey = process.env.TEST_OPENAI_API_KEY

if (!apiKey) {
  throw new Error('TEST_OPENAI_API_KEY is required')
}

const prisma = new PrismaClient()

const makeClient = () => {
  const realOpenAI = new OpenAI({ apiKey })

  return createClient({
    client: openaiClientAdapter({ openai: realOpenAI }),
    storage: prismaStorageAdapter({ prisma }),
    runAdapter: completionsRunAdapter(),
  })
}

after(async () => {
  await prisma.$disconnect()
})

// ── Group 1: Response Creation ─────────────────────────────────────

describe('Response Creation', () => {
  test('create response with string input', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say hello in one word.',
    })

    assert.ok(response.id)
    assert.equal(response.object, 'response')
    assert.equal(response.status, 'completed')
    assert.ok(response.output.length > 0)

    // Cleanup
    await prisma.response.delete({ where: { id: response.id } })
  })

  test('create response with array input', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: [
        { role: 'user', content: 'Say hello in one word.' },
      ],
    })

    assert.ok(response.id)
    assert.equal(response.status, 'completed')
    assert.ok(response.output.length > 0)

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('create response with instructions', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Always reply with exactly "pong".',
      input: 'ping',
    })

    assert.ok(response.id)
    assert.equal(response.status, 'completed')

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('create response with auto conversation', async () => {
    const client = makeClient()

    // First create a conversation
    const resp1 = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Remember: the magic word is "banana".',
      store: true,
    } as any)

    assert.ok(resp1.id)

    await prisma.response.delete({ where: { id: resp1.id } })
  })

  test('create response with explicit conversation', async () => {
    const client = makeClient()

    // Create conversation
    const conv = await prisma.conversation.create({ data: {} })

    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say hello.',
      conversation: { id: conv.id },
    } as any)

    assert.ok(response.id)
    assert.equal(response.status, 'completed')

    await prisma.response.delete({ where: { id: response.id } })
    await prisma.conversation.delete({ where: { id: conv.id } })
  })

  test('create non-streaming response', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say hi.',
    })

    assert.ok(response.id)
    assert.equal(response.object, 'response')
    assert.equal(response.status, 'completed')
    assert.ok(response.output.length > 0)

    await prisma.response.delete({ where: { id: response.id } })
  })
})

// ── Group 2: Response Shape ────────────────────────────────────────

describe('Response Shape', () => {
  test('response has all top-level fields', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say "test".',
    })

    assert.ok(response.id)
    assert.equal(response.object, 'response')
    assert.ok(response.created_at > 0)
    assert.equal(response.status, 'completed')
    assert.ok(response.model)
    assert.ok(Array.isArray(response.output))

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('output message has correct shape', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say "hello".',
    })

    const msg = response.output.find((item: any) => item.type === 'message')
    assert.ok(msg, 'Should have a message output item')
    assert.equal(msg.type, 'message')
    assert.equal(msg.role, 'assistant')
    assert.ok(Array.isArray(msg.content))

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('output_text has text content', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say exactly "hello world".',
    })

    const msg = response.output.find((item: any) => item.type === 'message')
    assert.ok(msg)
    const textContent = msg.content.find((c: any) => c.type === 'output_text')
    assert.ok(textContent, 'Should have output_text content')
    assert.ok(textContent.text.length > 0)

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('response has model field', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
    })

    assert.ok(response.model)

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('completed response has correct status', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
    })

    assert.equal(response.status, 'completed')

    await prisma.response.delete({ where: { id: response.id } })
  })
})

// ── Group 3: Streaming ─────────────────────────────────────────────

describe('Streaming', () => {
  test('stream emits response.created event', async () => {
    const client = makeClient()
    const events: any[] = []

    const stream = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say hi.',
      stream: true,
    })

    for await (const event of stream) {
      events.push(event)
    }

    assert.ok(events.some((e) => e.type === 'response.created'))

    // Get response ID from events
    const created = events.find((e) => e.type === 'response.created')
    if (created?.response?.id) {
      await prisma.response.delete({ where: { id: created.response.id } }).catch(() => {})
    }
  })

  test('stream emits response.in_progress event', async () => {
    const client = makeClient()
    const events: any[] = []

    const stream = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say hi.',
      stream: true,
    })

    for await (const event of stream) {
      events.push(event)
    }

    assert.ok(events.some((e) => e.type === 'response.in_progress'))

    const created = events.find((e) => e.type === 'response.created')
    if (created?.response?.id) {
      await prisma.response.delete({ where: { id: created.response.id } }).catch(() => {})
    }
  })

  test('stream emits response.output_item.added event', async () => {
    const client = makeClient()
    const events: any[] = []

    const stream = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say hi.',
      stream: true,
    })

    for await (const event of stream) {
      events.push(event)
    }

    assert.ok(events.some((e) => e.type === 'response.output_item.added'))

    const created = events.find((e) => e.type === 'response.created')
    if (created?.response?.id) {
      await prisma.response.delete({ where: { id: created.response.id } }).catch(() => {})
    }
  })

  test('stream emits response.output_text.delta events', async () => {
    const client = makeClient()
    const events: any[] = []

    const stream = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say "hello world".',
      stream: true,
    })

    for await (const event of stream) {
      events.push(event)
    }

    const deltas = events.filter((e) => e.type === 'response.output_text.delta')
    assert.ok(deltas.length > 0, 'Should have text delta events')
    assert.ok(deltas.every((d: any) => typeof d.delta === 'string'))

    const created = events.find((e) => e.type === 'response.created')
    if (created?.response?.id) {
      await prisma.response.delete({ where: { id: created.response.id } }).catch(() => {})
    }
  })

  test('stream emits response.output_text.done and response.output_item.done', async () => {
    const client = makeClient()
    const events: any[] = []

    const stream = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say hi.',
      stream: true,
    })

    for await (const event of stream) {
      events.push(event)
    }

    assert.ok(events.some((e) => e.type === 'response.output_text.done'))
    assert.ok(events.some((e) => e.type === 'response.output_item.done'))

    const created = events.find((e) => e.type === 'response.created')
    if (created?.response?.id) {
      await prisma.response.delete({ where: { id: created.response.id } }).catch(() => {})
    }
  })

  test('stream emits response.completed event', async () => {
    const client = makeClient()
    const events: any[] = []

    const stream = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say hi.',
      stream: true,
    })

    for await (const event of stream) {
      events.push(event)
    }

    assert.ok(events.some((e) => e.type === 'response.completed'))

    const completed = events.find((e) => e.type === 'response.completed')
    assert.ok(completed.response)
    assert.equal(completed.response.status, 'completed')

    if (completed?.response?.id) {
      await prisma.response.delete({ where: { id: completed.response.id } }).catch(() => {})
    }
  })
})

// ── Group 4: Tool Calls ────────────────────────────────────────────

describe('Tool Calls', () => {
  const tools: any[] = [
    {
      type: 'function',
      name: 'get_weather',
      description: 'Get weather for a city',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string' },
        },
        required: ['city'],
      },
    },
  ]

  test('function_call appears in output', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Use the get_weather tool, then answer.',
      input: 'What is the weather in Paris?',
      tools,
    })

    const funcCall = response.output.find((item: any) => item.type === 'function_call')
    assert.ok(funcCall, 'Should have a function_call output item')
    assert.equal(funcCall.type, 'function_call')
    assert.ok(funcCall.name)
    assert.ok(funcCall.call_id)

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('function_call has call_id, name, and arguments', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Use get_weather then answer.',
      input: 'What is the weather in Tokyo?',
      tools,
    })

    const funcCall = response.output.find((item: any) => item.type === 'function_call')
    assert.ok(funcCall)
    assert.ok(funcCall.call_id, 'Should have call_id')
    assert.equal(funcCall.name, 'get_weather')
    assert.ok(funcCall.arguments, 'Should have arguments')

    // Verify arguments is valid JSON
    const args = JSON.parse(funcCall.arguments)
    assert.ok(args.city)

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('streaming function call emits delta events', async () => {
    const client = makeClient()
    const events: any[] = []

    const stream = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Use get_weather then answer.',
      input: 'What is the weather in London?',
      tools,
      stream: true,
    })

    for await (const event of stream) {
      events.push(event)
    }

    const argDeltas = events.filter((e) => e.type === 'response.function_call_arguments.delta')
    assert.ok(argDeltas.length > 0, 'Should have function_call_arguments.delta events')

    const created = events.find((e) => e.type === 'response.created')
    if (created?.response?.id) {
      await prisma.response.delete({ where: { id: created.response.id } }).catch(() => {})
    }
  })

  test('streaming function call emits done event', async () => {
    const client = makeClient()
    const events: any[] = []

    const stream = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Use get_weather then answer.',
      input: 'What is the weather in Berlin?',
      tools,
      stream: true,
    })

    for await (const event of stream) {
      events.push(event)
    }

    assert.ok(events.some((e) => e.type === 'response.function_call_arguments.done'))

    const created = events.find((e) => e.type === 'response.created')
    if (created?.response?.id) {
      await prisma.response.delete({ where: { id: created.response.id } }).catch(() => {})
    }
  })

  test('submit tool output and get final response', async () => {
    const client = makeClient()

    // Create conversation for multi-turn
    const conv = await prisma.conversation.create({ data: {} })

    const response1 = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Use get_weather then answer with the result.',
      input: 'What is the weather in Paris?',
      tools,
      conversation: { id: conv.id },
    } as any)

    const funcCall = response1.output.find((item: any) => item.type === 'function_call')
    assert.ok(funcCall, 'Should have function_call')

    // Submit tool output
    const response2 = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Use get_weather then answer with the result.',
      input: [
        { type: 'function_call_output', call_id: funcCall.call_id, output: JSON.stringify({ temp: '20C', condition: 'sunny' }) },
      ],
      tools,
      conversation: { id: conv.id },
    } as any)

    assert.equal(response2.status, 'completed')
    const msg = response2.output.find((item: any) => item.type === 'message')
    assert.ok(msg, 'Should have message after tool output')

    await prisma.response.deleteMany({ where: { conversationId: conv.id } })
    await prisma.conversation.delete({ where: { id: conv.id } })
  })

  test('round-trip: tool call → output → completion', async () => {
    const client = makeClient()
    const conv = await prisma.conversation.create({ data: {} })

    const resp1 = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Always use get_weather to answer weather questions.',
      input: 'Weather in NYC?',
      tools,
      conversation: { id: conv.id },
    } as any)

    const fc = resp1.output.find((item: any) => item.type === 'function_call')
    assert.ok(fc, 'Step 1: should get function_call')

    const resp2 = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Always use get_weather to answer weather questions.',
      input: [
        { type: 'function_call_output', call_id: fc.call_id, output: '{"temp":"5C","condition":"snow"}' },
      ],
      tools,
      conversation: { id: conv.id },
    } as any)

    assert.equal(resp2.status, 'completed')
    const msg = resp2.output.find((item: any) => item.type === 'message')
    assert.ok(msg, 'Step 2: should get final message')

    await prisma.response.deleteMany({ where: { conversationId: conv.id } })
    await prisma.conversation.delete({ where: { id: conv.id } })
  })

  test('multiple function calls in single response', async () => {
    const client = makeClient()
    const multiTools: any[] = [
      {
        type: 'function',
        name: 'get_weather',
        description: 'Get weather for a city',
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      },
      {
        type: 'function',
        name: 'get_time',
        description: 'Get current time in a city',
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      },
    ]

    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Always call BOTH get_weather AND get_time tools simultaneously for any city question.',
      input: 'What is the weather and time in Tokyo?',
      tools: multiTools,
    })

    const funcCalls = response.output.filter((item: any) => item.type === 'function_call')
    // Model may or may not call both — at least one
    assert.ok(funcCalls.length >= 1, 'Should have at least one function_call')

    await prisma.response.delete({ where: { id: response.id } })
  })
})

// ── Group 5: Conversation ──────────────────────────────────────────

describe('Conversation', () => {
  test('multi-turn maintains context', async () => {
    const client = makeClient()
    const conv = await prisma.conversation.create({ data: {} })

    await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Remember this number: 42.',
      conversation: { id: conv.id },
    } as any)

    const resp2 = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'What number did I ask you to remember? Reply with just the number.',
      conversation: { id: conv.id },
    } as any)

    const msg = resp2.output.find((item: any) => item.type === 'message')
    assert.ok(msg)
    const text = msg.content.find((c: any) => c.type === 'output_text')?.text ?? ''
    assert.ok(text.includes('42'), `Expected response to contain "42", got: ${text}`)

    await prisma.response.deleteMany({ where: { conversationId: conv.id } })
    await prisma.conversation.delete({ where: { id: conv.id } })
  })

  test('conversation persists across responses', async () => {
    const client = makeClient()
    const conv = await prisma.conversation.create({ data: {} })

    const resp1 = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say hello.',
      conversation: { id: conv.id },
    } as any)

    const resp2 = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say goodbye.',
      conversation: { id: conv.id },
    } as any)

    // Both should be in the same conversation
    const responses = await prisma.response.findMany({
      where: { conversationId: conv.id },
    })
    assert.equal(responses.length, 2)

    await prisma.response.deleteMany({ where: { conversationId: conv.id } })
    await prisma.conversation.delete({ where: { id: conv.id } })
  })

  test('responses without conversation are standalone', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say hi.',
    })

    const dbResponse = await prisma.response.findUnique({
      where: { id: response.id },
    })

    assert.equal(dbResponse?.conversationId, null)

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('input items are stored on response', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: [
        { role: 'user', content: 'test message' },
      ],
    })

    const dbResponse = await prisma.response.findUnique({
      where: { id: response.id },
      select: { input: true },
    })

    assert.ok(dbResponse?.input)
    const input = dbResponse!.input as any[]
    assert.ok(Array.isArray(input))
    assert.equal(input.length, 1)

    await prisma.response.delete({ where: { id: response.id } })
  })
})

// ── Group 6: Retrieve / Delete ─────────────────────────────────────

describe('Retrieve and Delete', () => {
  test('retrieve response by ID', async () => {
    const client = makeClient()
    const created = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say hi.',
    })

    const retrieved = await client.responses.retrieve(created.id)

    assert.equal(retrieved.id, created.id)
    assert.equal(retrieved.object, 'response')
    assert.equal(retrieved.status, 'completed')

    await prisma.response.delete({ where: { id: created.id } })
  })

  test('retrieved response has correct status', async () => {
    const client = makeClient()
    const created = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
    })

    const retrieved = await client.responses.retrieve(created.id)
    assert.equal(retrieved.status, 'completed')

    await prisma.response.delete({ where: { id: created.id } })
  })

  test('delete response', async () => {
    const client = makeClient()
    const created = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
    })

    await client.responses.delete(created.id)

    const dbResponse = await prisma.response.findUnique({
      where: { id: created.id },
    })
    assert.equal(dbResponse, null)
  })

  test('list input items', async () => {
    const client = makeClient()
    const created = await client.responses.create({
      model: 'gpt-4o-mini',
      input: [
        { role: 'user', content: 'test input' },
      ],
    })

    const inputItems = await client.responses.inputItems.list(created.id)

    assert.ok(Array.isArray(inputItems.data))
    assert.ok(inputItems.data.length > 0)

    await prisma.response.delete({ where: { id: created.id } })
  })

  test('input items have pagination fields', async () => {
    const client = makeClient()
    const created = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'simple input',
    })

    const inputItems = await client.responses.inputItems.list(created.id)

    assert.ok(Array.isArray(inputItems.data))
    assert.equal(typeof inputItems.has_more, 'boolean')

    await prisma.response.delete({ where: { id: created.id } })
  })
})

// ── Group 7: Non-streaming specifics ───────────────────────────────

describe('Non-streaming specifics', () => {
  test('non-streaming returns complete object', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say one word.',
    })

    assert.equal(response.object, 'response')
    assert.equal(response.status, 'completed')
    assert.ok(response.id)
    assert.ok(response.created_at > 0)
    assert.ok(Array.isArray(response.output))

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('non-streaming has populated output', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say "hello".',
    })

    assert.ok(response.output.length > 0)
    const msg = response.output.find((item: any) => item.type === 'message')
    assert.ok(msg)
    assert.ok(msg.content.length > 0)

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('non-streaming tool calls return in output', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Always use the tool.',
      input: 'What is 2+2?',
      tools: [{
        type: 'function',
        name: 'calculate',
        description: 'Calculate math',
        parameters: {
          type: 'object',
          properties: { expression: { type: 'string' } },
          required: ['expression'],
        },
      }],
    })

    const funcCall = response.output.find((item: any) => item.type === 'function_call')
    assert.ok(funcCall, 'Non-streaming should have function_call in output')

    await prisma.response.delete({ where: { id: response.id } })
  })
})

// ── Group 8: Edge Cases ────────────────────────────────────────────

describe('Edge Cases', () => {
  test('response with metadata', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
      metadata: { custom: 'value' },
    } as any)

    assert.ok(response.id)

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('response stores input for later retrieval', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'test storing input',
    })

    const dbResponse = await prisma.response.findUnique({
      where: { id: response.id },
      select: { input: true },
    })

    assert.ok(dbResponse?.input)

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('cancel a response', async () => {
    const client = makeClient()

    // Create a response that we'll cancel
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
    })

    // Cancel it (it's already completed, but the API should still update status)
    const cancelled = await client.responses.cancel(response.id)

    assert.equal(cancelled.id, response.id)
    assert.equal(cancelled.status, 'cancelled')

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('multiple responses in same conversation tracked correctly', async () => {
    const client = makeClient()
    const conv = await prisma.conversation.create({ data: {} })

    const r1 = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'first',
      conversation: { id: conv.id },
    } as any)

    const r2 = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'second',
      conversation: { id: conv.id },
    } as any)

    const r3 = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'third',
      conversation: { id: conv.id },
    } as any)

    const responses = await prisma.response.findMany({
      where: { conversationId: conv.id },
      orderBy: { createdAt: 'asc' },
    })
    assert.equal(responses.length, 3)

    await prisma.response.deleteMany({ where: { conversationId: conv.id } })
    await prisma.conversation.delete({ where: { id: conv.id } })
  })
})
