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

/**
 * Mirror of assistantsApiCompat.test.ts — same scenarios,
 * expressed through the Responses API surface.
 *
 * Mapping:
 *   Assistant  → instructions / model (per-request)
 *   Thread     → Conversation
 *   Message    → input items
 *   Run        → Response
 *   Run Step   → output item (message | function_call)
 */

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

// ── 1. Configuration (mirrors Assistants CRUD) ───────────────────

describe('Configuration', () => {
  describe('create', () => {
    test('with all fields', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        instructions: 'You are a helpful assistant.',
        input: 'Say "test".',
        metadata: { env: 'test' },
      } as any)

      assert.ok(response.id)
      assert.equal(response.object, 'response')
      assert.ok(typeof response.created_at === 'number')
      assert.equal(response.status, 'completed')
      assert.ok(typeof response.model === 'string')
      assert.ok(Array.isArray(response.output))

      await prisma.response.delete({ where: { id: response.id } })
    })

    test('with minimal fields', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: 'hi',
      })

      assert.ok(response.id)
      assert.equal(response.object, 'response')
      assert.equal(response.status, 'completed')
      assert.ok(response.model)

      await prisma.response.delete({ where: { id: response.id } })
    })

    test('with different instructions per request', async () => {
      const client = makeClient()

      const resp1 = await client.responses.create({
        model: 'gpt-4o-mini',
        instructions: 'Always reply with exactly "alpha".',
        input: 'Say the word.',
      })

      const resp2 = await client.responses.create({
        model: 'gpt-4o-mini',
        instructions: 'Always reply with exactly "beta".',
        input: 'Say the word.',
      })

      const text1 = (resp1 as any).output.find((i: any) => i.type === 'message')?.content?.find((c: any) => c.type === 'output_text')?.text ?? ''
      const text2 = (resp2 as any).output.find((i: any) => i.type === 'message')?.content?.find((c: any) => c.type === 'output_text')?.text ?? ''

      assert.ok(text1.toLowerCase().includes('alpha'), `Expected "alpha", got: ${text1}`)
      assert.ok(text2.toLowerCase().includes('beta'), `Expected "beta", got: ${text2}`)

      await prisma.response.delete({ where: { id: resp1.id } })
      await prisma.response.delete({ where: { id: resp2.id } })
    })
  })

  describe('retrieve', () => {
    test('by ID', async () => {
      const client = makeClient()
      const created = await client.responses.create({
        model: 'gpt-4o-mini',
        input: 'Retrieve me',
      })

      const retrieved = await client.responses.retrieve(created.id)

      assert.equal(retrieved.id, created.id)
      assert.equal(retrieved.object, 'response')
      assert.equal(retrieved.status, 'completed')

      await prisma.response.delete({ where: { id: created.id } })
    })
  })

  describe('delete', () => {
    test('removes from DB', async () => {
      const client = makeClient()
      const created = await client.responses.create({
        model: 'gpt-4o-mini',
        input: 'Delete me',
      })

      await client.responses.delete(created.id)

      const dbResponse = await prisma.response.findUnique({ where: { id: created.id } })
      assert.equal(dbResponse, null)
    })
  })
})

// ── 2. Conversations (mirrors Threads CRUD) ──────────────────────

describe('Conversations', () => {
  describe('create', () => {
    test('with explicit conversation', async () => {
      const client = makeClient()
      const conv = await prisma.conversation.create({ data: { metadata: { purpose: 'testing' } } })

      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: 'Hello!',
        conversation: { id: conv.id },
      } as any)

      assert.ok(response.id)
      assert.equal(response.status, 'completed')

      const dbResp = await prisma.response.findUnique({ where: { id: response.id } })
      assert.equal(dbResp?.conversationId, conv.id)

      await prisma.response.delete({ where: { id: response.id } })
      await prisma.conversation.delete({ where: { id: conv.id } })
    })

    test('standalone (no conversation)', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: 'Standalone',
      })

      const dbResp = await prisma.response.findUnique({ where: { id: response.id } })
      assert.equal(dbResp?.conversationId, null)

      await prisma.response.delete({ where: { id: response.id } })
    })
  })

  describe('linking', () => {
    test('multiple responses share conversation', async () => {
      const client = makeClient()
      const conv = await prisma.conversation.create({ data: {} })

      const r1 = await client.responses.create({
        model: 'gpt-4o-mini',
        input: 'First.',
        conversation: { id: conv.id },
      } as any)

      const r2 = await client.responses.create({
        model: 'gpt-4o-mini',
        input: 'Second.',
        conversation: { id: conv.id },
      } as any)

      const responses = await prisma.response.findMany({ where: { conversationId: conv.id } })
      assert.equal(responses.length, 2)
      assert.ok(responses.some((r) => r.id === r1.id))
      assert.ok(responses.some((r) => r.id === r2.id))

      await prisma.response.deleteMany({ where: { conversationId: conv.id } })
      await prisma.conversation.delete({ where: { id: conv.id } })
    })
  })

  describe('delete', () => {
    test('cascade deletes responses', async () => {
      const client = makeClient()
      const conv = await prisma.conversation.create({ data: {} })

      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: 'Will be deleted.',
        conversation: { id: conv.id },
      } as any)

      await prisma.conversation.delete({ where: { id: conv.id } })

      const dbResp = await prisma.response.findUnique({ where: { id: response.id } })
      assert.equal(dbResp, null)
    })
  })
})

// ── 3. Input Items (mirrors Messages CRUD) ───────────────────────

describe('Input Items', () => {
  describe('create', () => {
    test('string input is stored', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: 'Hello!',
      })

      const dbResp = await prisma.response.findUnique({
        where: { id: response.id },
        select: { input: true },
      })
      assert.ok(dbResp?.input)

      await prisma.response.delete({ where: { id: response.id } })
    })

    test('array input is stored', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: [
          { role: 'user', content: 'Part one' },
          { role: 'user', content: 'Part two' },
        ],
      })

      const inputItems = await client.responses.inputItems.list(response.id)
      assert.equal(inputItems.data.length, 2)

      await prisma.response.delete({ where: { id: response.id } })
    })
  })

  describe('list', () => {
    test('returns items with correct shape', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: [
          { role: 'user', content: 'Retrieve me' },
        ],
      })

      const inputItems = await client.responses.inputItems.list(response.id)
      const item = inputItems.data[0] as any

      assert.ok(item.id)
      assert.equal(item.role, 'user')

      await prisma.response.delete({ where: { id: response.id } })
    })

    test('has pagination fields', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: [
          { role: 'user', content: 'msg1' },
          { role: 'user', content: 'msg2' },
        ],
      })

      const inputItems = await client.responses.inputItems.list(response.id)
      assert.ok(Array.isArray(inputItems.data))
      assert.equal(typeof inputItems.has_more, 'boolean')

      await prisma.response.delete({ where: { id: response.id } })
    })

    test('string input produces at least one item', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: 'just a string',
      })

      const inputItems = await client.responses.inputItems.list(response.id)
      assert.ok(inputItems.data.length >= 1)

      await prisma.response.delete({ where: { id: response.id } })
    })
  })

  describe('pagination', () => {
    test('limit and after cursor', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: [
          { role: 'user', content: 'Message 0' },
          { role: 'user', content: 'Message 1' },
          { role: 'user', content: 'Message 2' },
          { role: 'user', content: 'Message 3' },
          { role: 'user', content: 'Message 4' },
        ],
      })

      const page1 = await client.responses.inputItems.list(response.id, { limit: 3 })
      assert.equal(page1.data.length, 3)
      assert.equal(page1.has_more, true)

      const lastItem = page1.data[page1.data.length - 1]
      const page2 = await client.responses.inputItems.list(response.id, {
        limit: 3,
        after: lastItem.id,
      })
      assert.equal(page2.data.length, 2)
      assert.equal(page2.has_more, false)

      await prisma.response.delete({ where: { id: response.id } })
    })

    test('default returns all items', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: [
          { role: 'user', content: 'A' },
          { role: 'user', content: 'B' },
        ],
      })

      const items = await client.responses.inputItems.list(response.id)
      assert.equal(items.data.length, 2)

      await prisma.response.delete({ where: { id: response.id } })
    })
  })
})

// ── 4. Response Lifecycle (mirrors Runs) ─────────────────────────

describe('Response Lifecycle', () => {
  describe('basic completion', () => {
    test('non-streaming', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        instructions: 'Reply with "pong" to any message.',
        input: 'ping',
      })

      assert.equal(response.status, 'completed')
      assert.equal(response.object, 'response')
      assert.ok(response.id)

      const msg = response.output.find((item: any) => item.type === 'message')
      assert.ok(msg, 'Should have an assistant message')

      await prisma.response.delete({ where: { id: response.id } })
    })

    test('streaming', async () => {
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

      const completed = events.find((e) => e.type === 'response.completed')
      assert.ok(completed)
      assert.equal(completed.response.status, 'completed')

      if (completed?.response?.id) {
        await prisma.response.delete({ where: { id: completed.response.id } }).catch(() => {})
      }
    })
  })

  describe('conversation context', () => {
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
      const text = msg?.content?.find((c: any) => c.type === 'output_text')?.text ?? ''
      assert.ok(text.includes('42'), `Expected "42", got: ${text}`)

      await prisma.response.deleteMany({ where: { conversationId: conv.id } })
      await prisma.conversation.delete({ where: { id: conv.id } })
    })

    test('multiple responses tracked', async () => {
      const client = makeClient()
      const conv = await prisma.conversation.create({ data: {} })

      await client.responses.create({
        model: 'gpt-4o-mini',
        input: 'hi',
        conversation: { id: conv.id },
      } as any)

      await client.responses.create({
        model: 'gpt-4o-mini',
        input: 'again',
        conversation: { id: conv.id },
      } as any)

      const responses = await prisma.response.findMany({
        where: { conversationId: conv.id },
        orderBy: { createdAt: 'asc' },
      })
      assert.ok(responses.length >= 2)
      assert.ok(responses[0].createdAt <= responses[1].createdAt)

      await prisma.response.deleteMany({ where: { conversationId: conv.id } })
      await prisma.conversation.delete({ where: { id: conv.id } })
    })
  })

  describe('retrieve', () => {
    test('by ID', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: 'hi',
      })

      const retrieved = await client.responses.retrieve(response.id)
      assert.equal(retrieved.id, response.id)
      assert.equal(retrieved.object, 'response')

      await prisma.response.delete({ where: { id: response.id } })
    })
  })

  describe('metadata', () => {
    test('persists on response', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: 'hi',
        metadata: { tagged: 'yes' },
      } as any)

      const dbResp = await prisma.response.findUnique({
        where: { id: response.id },
        select: { metadata: true },
      })
      assert.deepEqual(dbResp?.metadata, { tagged: 'yes' })

      await prisma.response.delete({ where: { id: response.id } })
    })
  })

  describe('cancel', () => {
    test('sets status to cancelled', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: 'hi',
      })

      const cancelled = await client.responses.cancel(response.id)
      assert.equal(cancelled.id, response.id)
      assert.equal(cancelled.status, 'cancelled')

      await prisma.response.delete({ where: { id: response.id } })
    })
  })
})

// ── 5. Output Items (mirrors Run Steps) ──────────────────────────

describe('Output Items', () => {
  describe('message', () => {
    test('has correct shape', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        instructions: 'Reply briefly.',
        input: 'hi',
      })

      const msg = response.output.find((item: any) => item.type === 'message')
      assert.ok(msg, 'Should have a message output item')
      assert.equal(msg.type, 'message')
      assert.equal(msg.role, 'assistant')
      assert.equal(msg.status, 'completed')
      assert.ok(msg.id)
      assert.ok(Array.isArray(msg.content))

      await prisma.response.delete({ where: { id: response.id } })
    })

    test('has output_text content', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: 'hi',
      })

      const msg = response.output.find((item: any) => item.type === 'message')
      assert.ok(msg)

      const textContent = msg.content.find((c: any) => c.type === 'output_text')
      assert.ok(textContent, 'Should have output_text content')
      assert.equal(textContent.type, 'output_text')
      assert.ok(typeof textContent.text === 'string')
      assert.ok(textContent.text.length > 0)

      await prisma.response.delete({ where: { id: response.id } })
    })
  })

  describe('function_call', () => {
    test('has correct shape', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        instructions: 'Always use the lookup tool.',
        input: 'Look up Tokyo population',
        tools: [{
          type: 'function',
          name: 'lookup',
          description: 'Look up info',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        }],
      })

      const funcCall = response.output.find((item: any) => item.type === 'function_call')
      assert.ok(funcCall, 'Should have function_call output item')
      assert.equal(funcCall.type, 'function_call')
      assert.ok(funcCall.id)
      assert.ok(funcCall.call_id)
      assert.ok(funcCall.name)
      assert.ok(funcCall.arguments)

      const args = JSON.parse(funcCall.arguments)
      assert.ok(args.query)

      await prisma.response.delete({ where: { id: response.id } })
    })
  })
})

// ── 6. Tool Calls (mirrors Tool Calls Flow) ─────────────────────

describe('Tool Calls', () => {
  const tools: any[] = [{
    type: 'function',
    name: 'get_weather',
    description: 'Get weather for a city',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    },
  }]

  describe('non-streaming', () => {
    test('full cycle: call → output → completion', async () => {
      const client = makeClient()
      const conv = await prisma.conversation.create({ data: {} })

      const resp1 = await client.responses.create({
        model: 'gpt-4o-mini',
        instructions: 'Use get_weather then answer.',
        input: 'What is the weather in Paris?',
        tools,
        conversation: { id: conv.id },
      } as any)

      assert.equal(resp1.status, 'completed')
      const funcCall = resp1.output.find((item: any) => item.type === 'function_call')
      assert.ok(funcCall)
      assert.equal(funcCall.name, 'get_weather')

      const resp2 = await client.responses.create({
        model: 'gpt-4o-mini',
        instructions: 'Use get_weather then answer.',
        input: [
          { type: 'function_call_output', call_id: funcCall.call_id, output: JSON.stringify({ temp: '20C', condition: 'sunny' }) },
        ],
        tools,
        conversation: { id: conv.id },
      } as any)

      assert.equal(resp2.status, 'completed')
      const assistantMsg = resp2.output.find((item: any) => item.type === 'message')
      assert.ok(assistantMsg, 'Should have assistant message after tool output')

      await prisma.response.deleteMany({ where: { conversationId: conv.id } })
      await prisma.conversation.delete({ where: { id: conv.id } })
    })
  })

  describe('streaming', () => {
    test('full cycle: stream call → output → stream completion', async () => {
      const client = makeClient()
      const conv = await prisma.conversation.create({ data: {} })

      // Step 1: Stream to get tool call
      const events1: any[] = []
      const stream1 = await client.responses.create({
        model: 'gpt-4o-mini',
        instructions: 'Use get_weather then answer.',
        input: 'What is the weather in London?',
        tools,
        stream: true,
        conversation: { id: conv.id },
      } as any)

      for await (const event of stream1) {
        events1.push(event)
      }

      const completed1 = events1.find((e) => e.type === 'response.completed')
      assert.ok(completed1, 'Stream 1 should complete')

      const funcCallItem = completed1.response.output.find((item: any) => item.type === 'function_call')
      assert.ok(funcCallItem, 'Should have function_call in completed response')
      assert.ok(funcCallItem.call_id)
      assert.ok(funcCallItem.name)

      // Should have delta events
      const argDeltas = events1.filter((e) => e.type === 'response.function_call_arguments.delta')
      assert.ok(argDeltas.length > 0, 'Should have argument delta events')

      const argDone = events1.find((e) => e.type === 'response.function_call_arguments.done')
      assert.ok(argDone, 'Should have argument done event')

      // Step 2: Submit tool output, also streaming
      const events2: any[] = []
      const stream2 = await client.responses.create({
        model: 'gpt-4o-mini',
        instructions: 'Use get_weather then answer.',
        input: [
          { type: 'function_call_output', call_id: funcCallItem.call_id, output: '{"temp":"15C","condition":"cloudy"}' },
        ],
        tools,
        stream: true,
        conversation: { id: conv.id },
      } as any)

      for await (const event of stream2) {
        events2.push(event)
      }

      const completed2 = events2.find((e) => e.type === 'response.completed')
      assert.ok(completed2, 'Stream 2 should complete')

      const finalMsg = completed2.response.output.find((item: any) => item.type === 'message')
      assert.ok(finalMsg, 'Should have message in final response')

      const textDeltas = events2.filter((e) => e.type === 'response.output_text.delta')
      assert.ok(textDeltas.length > 0, 'Should have text deltas in step 2')

      await prisma.response.deleteMany({ where: { conversationId: conv.id } })
      await prisma.conversation.delete({ where: { id: conv.id } })
    })
  })
})

// ── 7. Response Shape (mirrors Run response shape) ──────────────

describe('Response Shape', () => {
  test('all expected fields present', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
    })

    assert.equal(response.object, 'response')
    assert.equal(response.status, 'completed')
    assert.ok(response.id)
    assert.ok(response.created_at > 0)
    assert.ok(response.model)
    assert.ok(Array.isArray(response.output))
    assert.equal(response.error, null)
    assert.equal(response.tool_choice, 'auto')
    assert.ok(response.truncation)
    assert.equal(response.truncation.type, 'disabled')

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('correct timestamp', async () => {
    const before = Math.floor(Date.now() / 1000) - 1
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Timestamp check',
    })
    const afterTime = Math.floor(Date.now() / 1000) + 1

    assert.ok(response.created_at >= before)
    assert.ok(response.created_at <= afterTime)

    await prisma.response.delete({ where: { id: response.id } })
  })
})

// ── 8. Multi-part Input (mirrors Thread with initial messages) ───

describe('Multi-part Input', () => {
  test('multiple input messages', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: [
        { role: 'user', content: 'First message' },
        { role: 'user', content: 'Second message' },
      ],
    })

    assert.ok(response.id)
    assert.equal(response.status, 'completed')

    const inputItems = await client.responses.inputItems.list(response.id)
    assert.ok(inputItems.data.length >= 2)

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('instructions plus user input', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'You are a pirate. Always speak like a pirate.',
      input: 'Hello!',
    })

    assert.ok(response.id)
    assert.equal(response.status, 'completed')

    await prisma.response.delete({ where: { id: response.id } })
  })
})

// ── 9. Edge Cases ────────────────────────────────────────────────

describe('Edge Cases', () => {
  test('tools defined but not called', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Just say hello, do not use any tools.',
      input: 'Say hello.',
      tools: [{
        type: 'function',
        name: 'unused_tool',
        description: 'A tool that should not be called',
        parameters: { type: 'object', properties: {} },
      }],
    })

    const msg = response.output.find((item: any) => item.type === 'message')
    assert.ok(msg, 'Should have a message output')

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('empty input items list shape', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'just text',
    })

    const inputItems = await client.responses.inputItems.list(response.id)
    assert.ok(Array.isArray(inputItems.data))
    assert.equal(inputItems.has_more, false)

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('cancelled response shape', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
    })

    const cancelled = await client.responses.cancel(response.id)
    assert.equal(cancelled.status, 'cancelled')
    assert.ok(Array.isArray(cancelled.output))

    await prisma.response.delete({ where: { id: response.id } })
  })
})

// ── 10. Tool Definition Storage ──────────────────────────────────

describe('Tool Definition Storage', () => {
  test('function tool definition stored in DB', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Always use the tool.',
      input: 'Calculate 1+1',
      tools: [{
        type: 'function',
        name: 'calculate',
        description: 'Calculate math expression',
        parameters: {
          type: 'object',
          properties: { expression: { type: 'string' } },
          required: ['expression'],
        },
      }],
    })

    // Verify tool stored in DB
    const tools = await prisma.responseTool.findMany({
      where: { responseId: response.id },
      include: { functionTool: true },
    })

    assert.equal(tools.length, 1)
    assert.equal(tools[0].type, 'FUNCTION')
    assert.ok(tools[0].functionTool)
    assert.equal(tools[0].functionTool!.name, 'calculate')
    assert.equal(tools[0].functionTool!.description, 'Calculate math expression')
    assert.ok(tools[0].functionTool!.parameters)

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('multiple function tools stored', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Use the appropriate tool.',
      input: 'What is the weather and time in Tokyo?',
      tools: [
        {
          type: 'function',
          name: 'get_weather',
          description: 'Get weather',
          parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
        },
        {
          type: 'function',
          name: 'get_time',
          description: 'Get time',
          parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
        },
      ],
    })

    const tools = await prisma.responseTool.findMany({
      where: { responseId: response.id },
      include: { functionTool: true },
    })

    assert.equal(tools.length, 2)
    const names = tools.map((t) => t.functionTool?.name).sort()
    assert.deepEqual(names, ['get_time', 'get_weather'])

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('tools appear in serialized response', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Just say hi.',
      input: 'hi',
      tools: [{
        type: 'function',
        name: 'my_tool',
        description: 'A tool',
        parameters: { type: 'object', properties: {} },
      }],
    })

    // Retrieve to get serialized form
    const retrieved = await client.responses.retrieve(response.id)
    assert.ok(Array.isArray(retrieved.tools))
    assert.ok(retrieved.tools.length >= 1)

    const tool = retrieved.tools.find((t: any) => t.type === 'function')
    assert.ok(tool)
    assert.equal(tool.name, 'my_tool')

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('response without tools has empty tools array', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
    })

    const retrieved = await client.responses.retrieve(response.id)
    assert.ok(Array.isArray(retrieved.tools))
    assert.equal(retrieved.tools.length, 0)

    await prisma.response.delete({ where: { id: response.id } })
  })
})

// ── 11. Parameter Control ────────────────────────────────────────

describe('Parameter Control', () => {
  describe('temperature and top_p', () => {
    test('custom temperature stored and returned', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: 'hi',
        temperature: 0.5,
      } as any)

      const dbResp = await prisma.response.findUnique({
        where: { id: response.id },
        select: { temperature: true },
      })
      assert.equal(dbResp?.temperature, 0.5)

      await prisma.response.delete({ where: { id: response.id } })
    })

    test('custom top_p stored and returned', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: 'hi',
        top_p: 0.9,
      } as any)

      const dbResp = await prisma.response.findUnique({
        where: { id: response.id },
        select: { topP: true },
      })
      assert.equal(dbResp?.topP, 0.9)

      await prisma.response.delete({ where: { id: response.id } })
    })

    test('defaults to null when not specified', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: 'hi',
      })

      const dbResp = await prisma.response.findUnique({
        where: { id: response.id },
        select: { temperature: true, topP: true },
      })
      assert.equal(dbResp?.temperature, null)
      assert.equal(dbResp?.topP, null)

      await prisma.response.delete({ where: { id: response.id } })
    })
  })

  describe('truncation', () => {
    test('default truncation is disabled', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: 'hi',
      })

      assert.ok(response.truncation)
      assert.equal(response.truncation.type, 'disabled')

      await prisma.response.delete({ where: { id: response.id } })
    })

    test('auto truncation stored', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: 'hi',
        truncation: { type: 'auto' },
      } as any)

      const dbResp = await prisma.response.findUnique({
        where: { id: response.id },
        select: { truncationType: true },
      })
      assert.equal(dbResp?.truncationType, 'AUTO')

      await prisma.response.delete({ where: { id: response.id } })
    })
  })

  describe('instructions', () => {
    test('instructions stored in DB', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        instructions: 'Be very concise.',
        input: 'hi',
      })

      const dbResp = await prisma.response.findUnique({
        where: { id: response.id },
        select: { instructions: true },
      })
      assert.equal(dbResp?.instructions, 'Be very concise.')

      await prisma.response.delete({ where: { id: response.id } })
    })

    test('null instructions when not provided', async () => {
      const client = makeClient()
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: 'hi',
      })

      const dbResp = await prisma.response.findUnique({
        where: { id: response.id },
        select: { instructions: true },
      })
      assert.equal(dbResp?.instructions, null)

      await prisma.response.delete({ where: { id: response.id } })
    })
  })
})

// ── 12. Streaming Event Order ────────────────────────────────────

describe('Streaming Event Order', () => {
  test('text response events in correct order', async () => {
    const client = makeClient()
    const events: any[] = []

    const stream = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say "hello".',
      stream: true,
    })

    for await (const event of stream) {
      events.push(event)
    }

    const types = events.map((e) => e.type)

    // response.created must come first
    assert.equal(types[0], 'response.created')

    // response.in_progress must come before any output
    const inProgressIdx = types.indexOf('response.in_progress')
    const firstAddedIdx = types.indexOf('response.output_item.added')
    assert.ok(inProgressIdx >= 0)
    assert.ok(firstAddedIdx >= 0)
    assert.ok(inProgressIdx < firstAddedIdx)

    // output_item.added must come before deltas
    const firstDeltaIdx = types.indexOf('response.output_text.delta')
    assert.ok(firstDeltaIdx >= 0)
    assert.ok(firstAddedIdx < firstDeltaIdx)

    // text done must come before item done
    const textDoneIdx = types.indexOf('response.output_text.done')
    const itemDoneIdx = types.indexOf('response.output_item.done')
    assert.ok(textDoneIdx >= 0)
    assert.ok(itemDoneIdx >= 0)
    assert.ok(textDoneIdx < itemDoneIdx)

    // response.completed must come last
    assert.equal(types[types.length - 1], 'response.completed')

    const created = events.find((e) => e.type === 'response.created')
    if (created?.response?.id) {
      await prisma.response.delete({ where: { id: created.response.id } }).catch(() => {})
    }
  })

  test('tool call events in correct order', async () => {
    const client = makeClient()
    const events: any[] = []

    const stream = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Always use the tool.',
      input: 'Calculate 2+2',
      tools: [{
        type: 'function',
        name: 'calc',
        description: 'Calculate',
        parameters: { type: 'object', properties: { expr: { type: 'string' } }, required: ['expr'] },
      }],
      stream: true,
    })

    for await (const event of stream) {
      events.push(event)
    }

    const types = events.map((e) => e.type)

    // Must have argument deltas before done
    const hasArgDelta = types.includes('response.function_call_arguments.delta')
    const hasArgDone = types.includes('response.function_call_arguments.done')

    if (hasArgDelta && hasArgDone) {
      const lastDeltaIdx = types.lastIndexOf('response.function_call_arguments.delta')
      const doneIdx = types.indexOf('response.function_call_arguments.done')
      assert.ok(lastDeltaIdx < doneIdx, 'All deltas should come before done')
    }

    // response.completed must come last
    assert.equal(types[types.length - 1], 'response.completed')

    const created = events.find((e) => e.type === 'response.created')
    if (created?.response?.id) {
      await prisma.response.delete({ where: { id: created.response.id } }).catch(() => {})
    }
  })
})

// ── 13. Output Item IDs and Uniqueness ───────────────────────────

describe('Output Item IDs', () => {
  test('output items have unique IDs', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
    })

    const ids = response.output.map((item: any) => item.id)
    const uniqueIds = new Set(ids)
    assert.equal(ids.length, uniqueIds.size, 'All output item IDs should be unique')
    ids.forEach((id: any) => assert.ok(id, 'Each output item should have an ID'))

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('function_call output items have unique IDs', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Call BOTH tools.',
      input: 'Weather and time in Tokyo?',
      tools: [
        {
          type: 'function',
          name: 'get_weather',
          description: 'Get weather',
          parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
        },
        {
          type: 'function',
          name: 'get_time',
          description: 'Get time',
          parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
        },
      ],
    })

    const funcCalls = response.output.filter((item: any) => item.type === 'function_call')
    if (funcCalls.length >= 2) {
      const ids = funcCalls.map((item: any) => item.id)
      const uniqueIds = new Set(ids)
      assert.equal(ids.length, uniqueIds.size, 'Function call IDs should be unique')
    }

    await prisma.response.delete({ where: { id: response.id } })
  })
})

// ── 14. Retrieved Response ───────────────────────────────────────

describe('Retrieved Response', () => {
  test('has populated output items', async () => {
    const client = makeClient()
    const created = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say hello.',
    })

    const retrieved = await client.responses.retrieve(created.id)

    assert.ok(retrieved.output.length > 0)
    const msg = retrieved.output.find((item: any) => item.type === 'message')
    assert.ok(msg)
    assert.ok(msg.content.length > 0)

    await prisma.response.delete({ where: { id: created.id } })
  })

  test('has same fields as created response', async () => {
    const client = makeClient()
    const created = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
    })

    const retrieved = await client.responses.retrieve(created.id)

    assert.equal(retrieved.id, created.id)
    assert.equal(retrieved.object, created.object)
    assert.equal(retrieved.status, created.status)
    assert.equal(retrieved.model, created.model)
    assert.equal(retrieved.created_at, created.created_at)

    await prisma.response.delete({ where: { id: created.id } })
  })

  test('function_call output items present after tool call', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Always use the tool.',
      input: 'Calculate 1+1',
      tools: [{
        type: 'function',
        name: 'calc',
        description: 'Calculate',
        parameters: { type: 'object', properties: { expr: { type: 'string' } }, required: ['expr'] },
      }],
    })

    const retrieved = await client.responses.retrieve(response.id)

    const funcCall = retrieved.output.find((item: any) => item.type === 'function_call')
    assert.ok(funcCall, 'Retrieved response should have function_call output')
    assert.ok(funcCall.call_id)
    assert.ok(funcCall.name)
    assert.ok(funcCall.arguments)

    await prisma.response.delete({ where: { id: response.id } })
  })
})

// ── 15. Multiple Tool Calls ──────────────────────────────────────

describe('Multiple Tool Calls', () => {
  test('parallel function calls in single response', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Always call BOTH get_weather AND get_time tools simultaneously for any city question.',
      input: 'What is the weather and time in Tokyo?',
      tools: [
        {
          type: 'function',
          name: 'get_weather',
          description: 'Get weather for a city',
          parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
        },
        {
          type: 'function',
          name: 'get_time',
          description: 'Get current time in a city',
          parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
        },
      ],
    })

    const funcCalls = response.output.filter((item: any) => item.type === 'function_call')
    assert.ok(funcCalls.length >= 1, 'Should have at least one function_call')

    // Each function call should have complete data
    for (const fc of funcCalls) {
      assert.ok(fc.call_id, 'Each function call should have call_id')
      assert.ok(fc.name, 'Each function call should have name')
      assert.ok(fc.arguments, 'Each function call should have arguments')
    }

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('parallel tool calls with streaming', async () => {
    const client = makeClient()
    const events: any[] = []

    const stream = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Always call BOTH tools simultaneously.',
      input: 'Weather and time in NYC?',
      tools: [
        {
          type: 'function',
          name: 'get_weather',
          description: 'Get weather',
          parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
        },
        {
          type: 'function',
          name: 'get_time',
          description: 'Get time',
          parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
        },
      ],
      stream: true,
    })

    for await (const event of stream) {
      events.push(event)
    }

    const completed = events.find((e) => e.type === 'response.completed')
    assert.ok(completed)

    const funcCalls = completed.response.output.filter((item: any) => item.type === 'function_call')
    assert.ok(funcCalls.length >= 1, 'Streaming should produce function_call items')

    // Should have had argument done events for each tool call
    const doneEvents = events.filter((e) => e.type === 'response.function_call_arguments.done')
    assert.ok(doneEvents.length >= 1, 'Should have at least one arguments.done event')

    if (completed?.response?.id) {
      await prisma.response.delete({ where: { id: completed.response.id } }).catch(() => {})
    }
  })

  test('submit multiple tool outputs in one turn', async () => {
    const client = makeClient()
    const conv = await prisma.conversation.create({ data: {} })

    // Step 1: Get multiple tool calls
    const resp1 = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Always call BOTH get_weather AND get_time simultaneously, then answer.',
      input: 'Weather and time in Paris?',
      tools: [
        {
          type: 'function',
          name: 'get_weather',
          description: 'Get weather',
          parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
        },
        {
          type: 'function',
          name: 'get_time',
          description: 'Get time',
          parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
        },
      ],
      conversation: { id: conv.id },
    } as any)

    const funcCalls = resp1.output.filter((item: any) => item.type === 'function_call')

    if (funcCalls.length >= 2) {
      // Step 2: Submit outputs for all tool calls
      const toolOutputs = funcCalls.map((fc: any) => ({
        type: 'function_call_output' as const,
        call_id: fc.call_id,
        output: JSON.stringify({ result: `Result for ${fc.name}` }),
      }))

      const resp2 = await client.responses.create({
        model: 'gpt-4o-mini',
        instructions: 'Always call BOTH get_weather AND get_time simultaneously, then answer.',
        input: toolOutputs,
        tools: [
          {
            type: 'function',
            name: 'get_weather',
            description: 'Get weather',
            parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
          },
          {
            type: 'function',
            name: 'get_time',
            description: 'Get time',
            parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
          },
        ],
        conversation: { id: conv.id },
      } as any)

      assert.equal(resp2.status, 'completed')
      const msg = resp2.output.find((item: any) => item.type === 'message')
      assert.ok(msg, 'Should have message after submitting multiple tool outputs')
    }

    await prisma.response.deleteMany({ where: { conversationId: conv.id } })
    await prisma.conversation.delete({ where: { id: conv.id } })
  })
})

// ── 16. Streaming Data Integrity ─────────────────────────────────

describe('Streaming Data Integrity', () => {
  test('text deltas concatenate to done text', async () => {
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

    const deltas = events
      .filter((e) => e.type === 'response.output_text.delta')
      .map((e) => e.delta)
    const concatenated = deltas.join('')

    const doneEvent = events.find((e) => e.type === 'response.output_text.done')
    assert.ok(doneEvent, 'Should have output_text.done event')
    assert.equal(concatenated, doneEvent.text, 'Concatenated deltas should equal done text')

    const created = events.find((e) => e.type === 'response.created')
    if (created?.response?.id) {
      await prisma.response.delete({ where: { id: created.response.id } }).catch(() => {})
    }
  })

  test('stream then retrieve matches', async () => {
    const client = makeClient()
    const events: any[] = []

    const stream = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say "test".',
      stream: true,
    })

    for await (const event of stream) {
      events.push(event)
    }

    const completed = events.find((e) => e.type === 'response.completed')
    assert.ok(completed)

    // Retrieve from DB — should match stream's completed response
    const retrieved = await client.responses.retrieve(completed.response.id)

    assert.equal(retrieved.id, completed.response.id)
    assert.equal(retrieved.status, 'completed')
    assert.equal(retrieved.output.length, completed.response.output.length)

    // Output text should match
    const streamMsg = completed.response.output.find((i: any) => i.type === 'message')
    const dbMsg = retrieved.output.find((i: any) => i.type === 'message')
    if (streamMsg && dbMsg) {
      const streamText = streamMsg.content?.find((c: any) => c.type === 'output_text')?.text
      const dbText = dbMsg.content?.find((c: any) => c.type === 'output_text')?.text
      assert.equal(streamText, dbText, 'Stream and DB text should match')
    }

    await prisma.response.delete({ where: { id: completed.response.id } }).catch(() => {})
  })
})

// ── 17. function_call_output in Input Items ──────────────────────

describe('function_call_output in Input Items', () => {
  test('tool output appears in input_items list', async () => {
    const client = makeClient()
    const conv = await prisma.conversation.create({ data: {} })

    const tools: any[] = [{
      type: 'function',
      name: 'calc',
      description: 'Calculate',
      parameters: { type: 'object', properties: { expr: { type: 'string' } }, required: ['expr'] },
    }]

    // Step 1: get tool call
    const resp1 = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Always use the calc tool.',
      input: 'What is 1+1?',
      tools,
      conversation: { id: conv.id },
    } as any)

    const funcCall = resp1.output.find((item: any) => item.type === 'function_call')
    assert.ok(funcCall)

    // Step 2: submit tool output
    const resp2 = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Always use the calc tool.',
      input: [
        { type: 'function_call_output', call_id: funcCall.call_id, output: '2' },
      ],
      tools,
      conversation: { id: conv.id },
    } as any)

    // Input items for resp2 should include the function_call_output
    const inputItems = await client.responses.inputItems.list(resp2.id)
    assert.ok(inputItems.data.length > 0)

    const toolOutputItem = inputItems.data.find((item: any) => item.type === 'function_call_output')
    assert.ok(toolOutputItem, 'Input items should include function_call_output')

    await prisma.response.deleteMany({ where: { conversationId: conv.id } })
    await prisma.conversation.delete({ where: { id: conv.id } })
  })
})

// ── 18. Cancelled Response in Conversation ───────────────────────

describe('Cancelled Response in Conversation', () => {
  test('cancelled response skipped in conversation history', async () => {
    const client = makeClient()
    const conv = await prisma.conversation.create({ data: {} })

    // Turn 1: normal response
    const resp1 = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Remember: the secret word is "banana".',
      conversation: { id: conv.id },
    } as any)

    // Turn 2: create and cancel
    const resp2 = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'This will be cancelled.',
      conversation: { id: conv.id },
    } as any)
    await client.responses.cancel(resp2.id)

    // Turn 3: should still have context from turn 1 (cancelled response excluded)
    const resp3 = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'What is the secret word? Reply with just the word.',
      conversation: { id: conv.id },
    } as any)

    const msg = resp3.output.find((item: any) => item.type === 'message')
    const text = msg?.content?.find((c: any) => c.type === 'output_text')?.text ?? ''
    assert.ok(text.toLowerCase().includes('banana'), `Expected "banana", got: ${text}`)

    await prisma.response.deleteMany({ where: { conversationId: conv.id } })
    await prisma.conversation.delete({ where: { id: conv.id } })
  })
})

// ── 19. Conversation Field in Response ───────────────────────────

describe('Conversation Field in Response', () => {
  test('present when conversation provided', async () => {
    const client = makeClient()
    const conv = await prisma.conversation.create({ data: {} })

    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
      conversation: { id: conv.id },
    } as any)

    // Retrieve to check serialized form
    const retrieved = await client.responses.retrieve(response.id)
    assert.ok((retrieved as any).conversation, 'Should have conversation field')
    assert.equal((retrieved as any).conversation.id, conv.id)

    await prisma.response.delete({ where: { id: response.id } })
    await prisma.conversation.delete({ where: { id: conv.id } })
  })

  test('absent when no conversation', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
    })

    const retrieved = await client.responses.retrieve(response.id)
    assert.equal((retrieved as any).conversation, undefined)

    await prisma.response.delete({ where: { id: response.id } })
  })
})

// ── 20. Empty Arguments Tool Call ────────────────────────────────

describe('Empty Arguments Tool Call', () => {
  test('function with no required params', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Always use the ping tool.',
      input: 'Ping!',
      tools: [{
        type: 'function',
        name: 'ping',
        description: 'Ping the server. Takes no arguments.',
        parameters: { type: 'object', properties: {} },
      }],
    })

    const funcCall = response.output.find((item: any) => item.type === 'function_call')
    assert.ok(funcCall, 'Should have function_call')
    assert.equal(funcCall.name, 'ping')
    // Arguments should be valid JSON (likely "{}")
    assert.doesNotThrow(() => JSON.parse(funcCall.arguments))

    await prisma.response.delete({ where: { id: response.id } })
  })
})

// ── 21. Strict Function Tool ─────────────────────────────────────

describe('Strict Function Tool', () => {
  test('strict mode stored in DB', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Use the tool.',
      input: 'Calculate 1+1',
      tools: [{
        type: 'function',
        name: 'calc',
        description: 'Calculate',
        parameters: { type: 'object', properties: { expr: { type: 'string' } }, required: ['expr'] },
        strict: true,
      }],
    })

    const tools = await prisma.responseTool.findMany({
      where: { responseId: response.id },
      include: { functionTool: true },
    })

    assert.equal(tools.length, 1)
    assert.equal(tools[0].functionTool!.strict, true)

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('non-strict by default', async () => {
    const client = makeClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
      tools: [{
        type: 'function',
        name: 'greet',
        description: 'Greet',
        parameters: { type: 'object', properties: {} },
      }],
    })

    const tools = await prisma.responseTool.findMany({
      where: { responseId: response.id },
      include: { functionTool: true },
    })

    assert.equal(tools[0].functionTool!.strict, false)

    await prisma.response.delete({ where: { id: response.id } })
  })
})

// ── 22. Multi-step Tool Conversation ─────────────────────────────

describe('Multi-step Tool Conversation', () => {
  test('question → tool → output → answer → new question → tool → output → answer', async () => {
    const client = makeClient()
    const conv = await prisma.conversation.create({ data: {} })

    const tools: any[] = [{
      type: 'function',
      name: 'lookup',
      description: 'Look up a fact',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    }]
    const instructions = 'Always use the lookup tool to answer questions.'

    // Turn 1: question → tool call
    const resp1 = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions,
      input: 'What is the capital of France?',
      tools,
      conversation: { id: conv.id },
    } as any)

    const fc1 = resp1.output.find((item: any) => item.type === 'function_call')
    assert.ok(fc1, 'Turn 1 should produce function_call')

    // Turn 2: tool output → answer
    const resp2 = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions,
      input: [
        { type: 'function_call_output', call_id: fc1.call_id, output: 'Paris' },
      ],
      tools,
      conversation: { id: conv.id },
    } as any)

    const msg2 = resp2.output.find((item: any) => item.type === 'message')
    assert.ok(msg2, 'Turn 2 should produce message')

    // Turn 3: new question → tool call
    const resp3 = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions,
      input: 'What is the capital of Japan?',
      tools,
      conversation: { id: conv.id },
    } as any)

    const fc3 = resp3.output.find((item: any) => item.type === 'function_call')
    assert.ok(fc3, 'Turn 3 should produce function_call')

    // Turn 4: tool output → answer
    const resp4 = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions,
      input: [
        { type: 'function_call_output', call_id: fc3.call_id, output: 'Tokyo' },
      ],
      tools,
      conversation: { id: conv.id },
    } as any)

    const msg4 = resp4.output.find((item: any) => item.type === 'message')
    assert.ok(msg4, 'Turn 4 should produce final message')
    assert.equal(resp4.status, 'completed')

    // Verify all 4 responses exist in conversation
    const responses = await prisma.response.findMany({
      where: { conversationId: conv.id },
    })
    assert.equal(responses.length, 4)

    await prisma.response.deleteMany({ where: { conversationId: conv.id } })
    await prisma.conversation.delete({ where: { id: conv.id } })
  })
})
