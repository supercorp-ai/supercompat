import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import OpenAI from 'openai'
import { PrismaClient } from '@prisma/client'
import { HttpsProxyAgent } from 'https-proxy-agent'
import {
  supercompat,
  openaiClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from '../src/index'

const apiKey = process.env.TEST_OPENAI_API_KEY

if (!apiKey) {
  throw new Error('TEST_OPENAI_API_KEY is required')
}

const prisma = new PrismaClient()

const createClient = () => {
  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  return supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
    storage: prismaStorageAdapter({ prisma }),
    runAdapter: completionsRunAdapter(),
  })
}

after(async () => {
  await prisma.$disconnect()
})

// ── Group 1: Assistants CRUD ──────────────────────────────────────

describe('Assistants CRUD', () => {
  test('create assistant with all fields', async () => {
    const client = createClient()
    const assistant = await client.beta.assistants.create({
      model: 'gpt-4o-mini',
      name: 'Test Assistant',
      description: 'A test assistant',
      instructions: 'You are a helpful assistant.',
      metadata: { env: 'test' },
    })

    assert.ok(assistant.id)
    assert.equal(assistant.object, 'assistant')
    assert.equal(assistant.name, 'Test Assistant')
    assert.equal(assistant.description, 'A test assistant')
    assert.equal(assistant.model, 'gpt-4o-mini')
    assert.equal(assistant.instructions, 'You are a helpful assistant.')
    assert.deepEqual(assistant.metadata, { env: 'test' })
    assert.ok(assistant.created_at > 0)
    assert.deepEqual(assistant.tools, [])

    // Cleanup
    await client.beta.assistants.delete(assistant.id)
  })

  test('list assistants', async () => {
    const client = createClient()
    const a1 = await client.beta.assistants.create({ model: 'gpt-4o-mini', name: 'List1' })
    const a2 = await client.beta.assistants.create({ model: 'gpt-4o-mini', name: 'List2' })

    const list = await client.beta.assistants.list({ limit: 10 })

    assert.ok(list.data.length >= 2)
    assert.ok(list.data.some((a: any) => a.id === a1.id))
    assert.ok(list.data.some((a: any) => a.id === a2.id))

    // Cleanup
    await client.beta.assistants.delete(a1.id)
    await client.beta.assistants.delete(a2.id)
  })

  test('retrieve assistant by ID', async () => {
    const client = createClient()
    const created = await client.beta.assistants.create({
      model: 'gpt-4o-mini',
      name: 'Retrieve Me',
    })

    const retrieved = await client.beta.assistants.retrieve(created.id)

    assert.equal(retrieved.id, created.id)
    assert.equal(retrieved.name, 'Retrieve Me')
    assert.equal(retrieved.object, 'assistant')

    // Cleanup
    await client.beta.assistants.delete(created.id)
  })

  test('update assistant', async () => {
    const client = createClient()
    const created = await client.beta.assistants.create({
      model: 'gpt-4o-mini',
      name: 'Before Update',
    })

    const updated = await client.beta.assistants.update(created.id, {
      name: 'After Update',
      metadata: { updated: 'true' },
    })

    assert.equal(updated.id, created.id)
    assert.equal(updated.name, 'After Update')
    assert.deepEqual(updated.metadata, { updated: 'true' })

    // Cleanup
    await client.beta.assistants.delete(created.id)
  })

  test('delete assistant', async () => {
    const client = createClient()
    const created = await client.beta.assistants.create({ model: 'gpt-4o-mini' })

    const deleted = await client.beta.assistants.delete(created.id)

    assert.equal(deleted.id, created.id)
    assert.equal(deleted.object, 'assistant.deleted')
    assert.equal(deleted.deleted, true)
  })
})

// ── Group 2: Threads CRUD ─────────────────────────────────────────

describe('Threads CRUD', () => {
  let assistantId: string

  before(async () => {
    const assistant = await prisma.assistant.create({
      data: { modelSlug: 'gpt-4o-mini' },
    })
    assistantId = assistant.id
  })

  after(async () => {
    await prisma.assistant.deleteMany({ where: { id: assistantId } })
  })

  test('create thread with metadata', async () => {
    const client = createClient()
    const thread = await client.beta.threads.create({
      metadata: { assistantId, purpose: 'testing' },
    })

    assert.ok(thread.id)
    assert.equal(thread.object, 'thread')
    assert.ok(thread.created_at > 0)
    assert.ok(thread.metadata)

    // Cleanup
    await prisma.thread.delete({ where: { id: thread.id } })
  })

  test('retrieve thread by ID', async () => {
    const client = createClient()
    const thread = await client.beta.threads.create({
      metadata: { assistantId },
    })

    const retrieved = await client.beta.threads.retrieve(thread.id)

    assert.equal(retrieved.id, thread.id)
    assert.equal(retrieved.object, 'thread')

    // Cleanup
    await prisma.thread.delete({ where: { id: thread.id } })
  })

  test('update thread metadata', async () => {
    const client = createClient()
    const thread = await client.beta.threads.create({
      metadata: { assistantId },
    })

    const updated = await client.beta.threads.update(thread.id, {
      metadata: { assistantId, updated: 'true' },
    })

    assert.equal(updated.id, thread.id)
    assert.deepEqual(updated.metadata, { assistantId, updated: 'true' })

    // Cleanup
    await prisma.thread.delete({ where: { id: thread.id } })
  })

  test('delete thread', async () => {
    const client = createClient()
    const thread = await client.beta.threads.create({
      metadata: { assistantId },
    })

    const deleted = await client.beta.threads.delete(thread.id)

    assert.equal(deleted.id, thread.id)
    assert.equal(deleted.object, 'thread.deleted')
    assert.equal(deleted.deleted, true)
  })
})

// ── Group 3: Messages CRUD ────────────────────────────────────────

describe('Messages CRUD', () => {
  let assistantId: string
  let threadId: string

  before(async () => {
    const assistant = await prisma.assistant.create({
      data: { modelSlug: 'gpt-4o-mini' },
    })
    assistantId = assistant.id
    const thread = await prisma.thread.create({
      data: { assistantId },
    })
    threadId = thread.id
  })

  after(async () => {
    await prisma.thread.deleteMany({ where: { id: threadId } })
    await prisma.assistant.deleteMany({ where: { id: assistantId } })
  })

  test('create message', async () => {
    const client = createClient()
    const msg = await client.beta.threads.messages.create(threadId, {
      role: 'user',
      content: 'Hello!',
    })

    assert.ok(msg.id)
    assert.equal(msg.object, 'thread.message')
    assert.equal(msg.thread_id, threadId)
    assert.equal(msg.role, 'user')
    assert.equal(msg.content[0].type, 'text')
    if (msg.content[0].type === 'text') {
      assert.equal(msg.content[0].text.value, 'Hello!')
    }
  })

  test('list messages with pagination', async () => {
    const client = createClient()
    await client.beta.threads.messages.create(threadId, {
      role: 'user',
      content: 'Message A',
    })
    await client.beta.threads.messages.create(threadId, {
      role: 'user',
      content: 'Message B',
    })

    const list = await client.beta.threads.messages.list(threadId, { limit: 2 })

    assert.ok(list.data.length <= 2)
    assert.ok(list.data.length > 0)
  })

  test('retrieve single message', async () => {
    const client = createClient()
    const created = await client.beta.threads.messages.create(threadId, {
      role: 'user',
      content: 'Retrieve me',
    })

    const retrieved = await client.beta.threads.messages.retrieve(created.id, {
      thread_id: threadId,
    })

    assert.equal(retrieved.id, created.id)
    assert.equal(retrieved.object, 'thread.message')
    assert.equal(retrieved.role, 'user')
  })

  test('update message metadata', async () => {
    const client = createClient()
    const created = await client.beta.threads.messages.create(threadId, {
      role: 'user',
      content: 'Update me',
    })

    const updated = await client.beta.threads.messages.update(created.id, {
      thread_id: threadId,
      metadata: { tagged: 'true' },
    })

    assert.equal(updated.id, created.id)
    assert.deepEqual(updated.metadata, { tagged: 'true' })
  })

  test('delete message', async () => {
    const client = createClient()
    const created = await client.beta.threads.messages.create(threadId, {
      role: 'user',
      content: 'Delete me',
    })

    const deleted = await client.beta.threads.messages.delete(created.id, {
      thread_id: threadId,
    })

    assert.equal(deleted.id, created.id)
    assert.equal(deleted.object, 'thread.message.deleted')
    assert.equal(deleted.deleted, true)
  })

  test('create message with array content', async () => {
    const client = createClient()
    const msg = await client.beta.threads.messages.create(threadId, {
      role: 'user',
      content: [
        { type: 'text', text: 'Part one' },
        { type: 'text', text: 'Part two' },
      ],
    })

    assert.ok(msg.id)
    assert.equal(msg.content.length, 2)
  })
})

// ── Group 4: Runs ─────────────────────────────────────────────────

describe('Runs', () => {
  test('create and poll run (basic completion)', async () => {
    const client = createClient()
    const assistant = await client.beta.assistants.create({
      model: 'gpt-4o-mini',
      instructions: 'Reply with "pong" to any message.',
    })

    const thread = await client.beta.threads.create({
      metadata: { assistantId: assistant.id },
    })

    await client.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: 'ping',
    })

    const run = await client.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistant.id,
    })

    assert.equal(run.status, 'completed')
    assert.equal(run.object, 'thread.run')
    assert.equal(run.thread_id, thread.id)
    assert.equal(run.assistant_id, assistant.id)

    // Cleanup
    await prisma.thread.delete({ where: { id: thread.id } })
    await client.beta.assistants.delete(assistant.id)
  })

  test('list runs for thread', async () => {
    const client = createClient()
    const assistant = await client.beta.assistants.create({
      model: 'gpt-4o-mini',
      instructions: 'Reply briefly.',
    })

    const thread = await client.beta.threads.create({
      metadata: { assistantId: assistant.id },
    })

    await client.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: 'hi',
    })

    await client.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistant.id,
    })

    const runs = await client.beta.threads.runs.list(thread.id)

    assert.ok(runs.data.length >= 1)

    // Cleanup
    await prisma.thread.delete({ where: { id: thread.id } })
    await client.beta.assistants.delete(assistant.id)
  })

  test('retrieve run by ID', async () => {
    const client = createClient()
    const assistant = await client.beta.assistants.create({
      model: 'gpt-4o-mini',
      instructions: 'Reply briefly.',
    })

    const thread = await client.beta.threads.create({
      metadata: { assistantId: assistant.id },
    })

    await client.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: 'hi',
    })

    const run = await client.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistant.id,
    })

    const retrieved = await client.beta.threads.runs.retrieve(run.id, {
      thread_id: thread.id,
    })

    assert.equal(retrieved.id, run.id)
    assert.equal(retrieved.object, 'thread.run')

    // Cleanup
    await prisma.thread.delete({ where: { id: thread.id } })
    await client.beta.assistants.delete(assistant.id)
  })

  test('update run metadata', async () => {
    const client = createClient()
    const assistant = await client.beta.assistants.create({
      model: 'gpt-4o-mini',
      instructions: 'Reply briefly.',
    })

    const thread = await client.beta.threads.create({
      metadata: { assistantId: assistant.id },
    })

    await client.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: 'hi',
    })

    const run = await client.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistant.id,
    })

    const updated = await client.beta.threads.runs.update(run.id, {
      thread_id: thread.id,
      metadata: { tagged: 'yes' },
    })

    assert.equal(updated.id, run.id)
    assert.deepEqual(updated.metadata, { tagged: 'yes' })

    // Cleanup
    await prisma.thread.delete({ where: { id: thread.id } })
    await client.beta.assistants.delete(assistant.id)
  })

  test('cancel a run', async () => {
    const client = createClient()
    const assistant = await client.beta.assistants.create({
      model: 'gpt-4o-mini',
      instructions: 'Reply briefly.',
    })

    const thread = await client.beta.threads.create({
      metadata: { assistantId: assistant.id },
    })

    await client.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: 'hi',
    })

    // Create run (non-polling) so we can cancel it
    const run = await client.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id,
    })

    const cancelled = await client.beta.threads.runs.cancel(run.id, {
      thread_id: thread.id,
    })

    assert.equal(cancelled.id, run.id)
    assert.ok(['cancelling', 'cancelled'].includes(cancelled.status))

    // Wait for the background run stream to settle before cleanup,
    // otherwise the in-flight OpenAI call may try to write to a deleted thread.
    await new Promise((r) => setTimeout(r, 5000))

    // Cleanup
    await prisma.thread.delete({ where: { id: thread.id } })
    await client.beta.assistants.delete(assistant.id)
  })
})

// ── Group 5: Run Steps ────────────────────────────────────────────

describe('Run Steps', () => {
  test('list run steps after completed run', async () => {
    const client = createClient()
    const assistant = await client.beta.assistants.create({
      model: 'gpt-4o-mini',
      instructions: 'Reply briefly.',
    })

    const thread = await client.beta.threads.create({
      metadata: { assistantId: assistant.id },
    })

    await client.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: 'hi',
    })

    const run = await client.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistant.id,
    })

    const steps = await client.beta.threads.runs.steps.list(run.id, {
      thread_id: thread.id,
    })

    assert.ok(steps.data.length >= 1)
    assert.equal(steps.data[0].object, 'thread.run.step')

    // Cleanup
    await prisma.thread.delete({ where: { id: thread.id } })
    await client.beta.assistants.delete(assistant.id)
  })

  test('retrieve single run step', async () => {
    const client = createClient()
    const assistant = await client.beta.assistants.create({
      model: 'gpt-4o-mini',
      instructions: 'Reply briefly.',
    })

    const thread = await client.beta.threads.create({
      metadata: { assistantId: assistant.id },
    })

    await client.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: 'hi',
    })

    const run = await client.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistant.id,
    })

    const steps = await client.beta.threads.runs.steps.list(run.id, {
      thread_id: thread.id,
    })
    const stepId = steps.data[0].id

    const retrieved = await client.beta.threads.runs.steps.retrieve(stepId, {
      thread_id: thread.id,
      run_id: run.id,
    })

    assert.equal(retrieved.id, stepId)
    assert.equal(retrieved.object, 'thread.run.step')
    assert.equal(retrieved.run_id, run.id)

    // Cleanup
    await prisma.thread.delete({ where: { id: thread.id } })
    await client.beta.assistants.delete(assistant.id)
  })
})

// ── Group 6: Tool Calls Flow ──────────────────────────────────────

describe('Tool Calls Flow', () => {
  const tools: OpenAI.Beta.Threads.Runs.RunCreateParams['tools'] = [
    {
      type: 'function',
      function: {
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
    },
  ]

  test('full tool call cycle', async () => {
    const client = createClient()
    const assistant = await client.beta.assistants.create({
      model: 'gpt-4o-mini',
      instructions: 'Use get_weather then answer.',
    })

    const thread = await client.beta.threads.create({
      metadata: { assistantId: assistant.id },
    })

    await client.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: 'What is the weather in Paris?',
    })

    const run = await client.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistant.id,
      tools,
    })

    assert.equal(run.status, 'requires_action')
    assert.ok(run.required_action)
    const toolCall = run.required_action!.submit_tool_outputs.tool_calls[0]
    assert.ok(toolCall)
    assert.equal(toolCall.function.name, 'get_weather')

    const completed = await client.beta.threads.runs.submitToolOutputsAndPoll(
      run.id,
      {
        thread_id: thread.id,
        tool_outputs: [
          {
            tool_call_id: toolCall.id,
            output: JSON.stringify({ temp: '20C', condition: 'sunny' }),
          },
        ],
      },
    )

    assert.equal(completed.status, 'completed')

    const messages = await client.beta.threads.messages.list(thread.id)
    const assistantMsg = messages.data.find((m: any) => m.role === 'assistant')
    assert.ok(assistantMsg)

    // Cleanup
    await prisma.thread.delete({ where: { id: thread.id } })
    await client.beta.assistants.delete(assistant.id)
  })
})

// ── Group 7: Pagination ───────────────────────────────────────────

describe('Pagination', () => {
  test('message pagination with limit and has_more', async () => {
    const client = createClient()
    const assistant = await prisma.assistant.create({
      data: { modelSlug: 'gpt-4o-mini' },
    })
    const thread = await prisma.thread.create({
      data: { assistantId: assistant.id },
    })

    // Create 5 messages
    for (let i = 0; i < 5; i++) {
      await client.beta.threads.messages.create(thread.id, {
        role: 'user',
        content: `Message ${i}`,
      })
    }

    const page1 = await client.beta.threads.messages.list(thread.id, { limit: 3 })
    assert.equal(page1.data.length, 3)
    assert.equal(page1.has_more, true)

    const lastItem = page1.data[page1.data.length - 1]
    const page2 = await client.beta.threads.messages.list(thread.id, {
      limit: 3,
      after: lastItem.id,
    })
    assert.equal(page2.data.length, 2)
    assert.equal(page2.has_more, false)

    // Cleanup
    await prisma.thread.delete({ where: { id: thread.id } })
    await prisma.assistant.delete({ where: { id: assistant.id } })
  })

  test('order=asc vs order=desc', async () => {
    const client = createClient()
    const assistant = await prisma.assistant.create({
      data: { modelSlug: 'gpt-4o-mini' },
    })
    const thread = await prisma.thread.create({
      data: { assistantId: assistant.id },
    })

    await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'First' })
    await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'Second' })

    const desc = await client.beta.threads.messages.list(thread.id, { order: 'desc' })
    const asc = await client.beta.threads.messages.list(thread.id, { order: 'asc' })

    assert.equal(desc.data[0].id, asc.data[asc.data.length - 1].id)
    assert.equal(desc.data[desc.data.length - 1].id, asc.data[0].id)

    // Cleanup
    await prisma.thread.delete({ where: { id: thread.id } })
    await prisma.assistant.delete({ where: { id: assistant.id } })
  })
})

// ── Group 8: List response shape ──────────────────────────────────

describe('List response shape', () => {
  test('assistants list returns data array with has_more', async () => {
    const client = createClient()
    const a = await client.beta.assistants.create({ model: 'gpt-4o-mini' })

    const list = await client.beta.assistants.list()

    assert.ok(Array.isArray(list.data))
    assert.ok(list.data.length > 0)
    assert.equal(typeof list.has_more, 'boolean')

    await client.beta.assistants.delete(a.id)
  })
})

// ── Group 9: Assistant edge cases ─────────────────────────────────

describe('Assistant edge cases', () => {
  test('create assistant with minimal fields', async () => {
    const client = createClient()
    const assistant = await client.beta.assistants.create({
      model: 'gpt-4o-mini',
    })

    assert.ok(assistant.id)
    assert.equal(assistant.object, 'assistant')
    assert.equal(assistant.model, 'gpt-4o-mini')
    assert.equal(assistant.name, null)
    assert.equal(assistant.description, null)
    assert.equal(assistant.instructions, null)
    assert.deepEqual(assistant.tools, [])

    await client.beta.assistants.delete(assistant.id)
  })

  test('update assistant model and instructions', async () => {
    const client = createClient()
    const created = await client.beta.assistants.create({
      model: 'gpt-4o-mini',
      instructions: 'Original instructions',
    })

    const updated = await client.beta.assistants.update(created.id, {
      model: 'gpt-4o',
      instructions: 'New instructions',
    })

    assert.equal(updated.model, 'gpt-4o')
    assert.equal(updated.instructions, 'New instructions')
    assert.equal(updated.id, created.id)

    await client.beta.assistants.delete(created.id)
  })

  test('list assistants pagination with after cursor', async () => {
    const client = createClient()
    const a1 = await client.beta.assistants.create({ model: 'gpt-4o-mini', name: 'Page1' })
    const a2 = await client.beta.assistants.create({ model: 'gpt-4o-mini', name: 'Page2' })
    const a3 = await client.beta.assistants.create({ model: 'gpt-4o-mini', name: 'Page3' })

    const page1 = await client.beta.assistants.list({ limit: 2 })
    assert.ok(page1.data.length <= 2)

    if (page1.has_more) {
      const lastItem = page1.data[page1.data.length - 1]
      const page2 = await client.beta.assistants.list({ limit: 2, after: lastItem.id })
      assert.ok(page2.data.length > 0)
      // Ensure no overlap
      const page1Ids = new Set(page1.data.map((a: any) => a.id))
      for (const a of page2.data) {
        assert.ok(!page1Ids.has(a.id), 'Page 2 should not contain items from page 1')
      }
    }

    await client.beta.assistants.delete(a1.id)
    await client.beta.assistants.delete(a2.id)
    await client.beta.assistants.delete(a3.id)
  })
})

// ── Group 10: Thread with initial messages ────────────────────────

describe('Thread with initial messages', () => {
  test('create thread with initial messages', async () => {
    const client = createClient()
    const assistant = await client.beta.assistants.create({ model: 'gpt-4o-mini' })

    const thread = await client.beta.threads.create({
      messages: [
        { role: 'user', content: 'First message' },
        { role: 'user', content: 'Second message' },
      ],
      metadata: { assistantId: assistant.id },
    })

    assert.ok(thread.id)
    assert.equal(thread.object, 'thread')

    // Verify messages were created
    const messages = await client.beta.threads.messages.list(thread.id, { order: 'asc' })
    assert.ok(messages.data.length >= 2)

    const first = messages.data[0]
    assert.equal(first.role, 'user')
    if (first.content[0].type === 'text') {
      assert.equal(first.content[0].text.value, 'First message')
    }

    // Cleanup
    await prisma.thread.delete({ where: { id: thread.id } })
    await client.beta.assistants.delete(assistant.id)
  })
})

// ── Group 11: Message content and metadata ────────────────────────

describe('Message content and metadata', () => {
  let assistantId: string
  let threadId: string

  before(async () => {
    const assistant = await prisma.assistant.create({
      data: { modelSlug: 'gpt-4o-mini' },
    })
    assistantId = assistant.id
    const thread = await prisma.thread.create({
      data: { assistantId },
    })
    threadId = thread.id
  })

  after(async () => {
    await prisma.thread.deleteMany({ where: { id: threadId } })
    await prisma.assistant.deleteMany({ where: { id: assistantId } })
  })

  test('create message with metadata', async () => {
    const client = createClient()
    const msg = await client.beta.threads.messages.create(threadId, {
      role: 'user',
      content: 'Message with meta',
      metadata: { key: 'value', priority: 'high' },
    })

    assert.ok(msg.id)
    assert.deepEqual(msg.metadata, { key: 'value', priority: 'high' })
  })

  test('message has correct content block structure', async () => {
    const client = createClient()
    const msg = await client.beta.threads.messages.create(threadId, {
      role: 'user',
      content: 'Structured content',
    })

    assert.equal(msg.content.length, 1)
    assert.equal(msg.content[0].type, 'text')
    if (msg.content[0].type === 'text') {
      assert.equal(msg.content[0].text.value, 'Structured content')
      assert.ok(Array.isArray(msg.content[0].text.annotations))
      assert.equal(msg.content[0].text.annotations.length, 0)
    }
  })

  test('message status defaults to completed', async () => {
    const client = createClient()
    const msg = await client.beta.threads.messages.create(threadId, {
      role: 'user',
      content: 'Status check',
    })

    assert.equal(msg.status, 'completed')
  })

  test('message has correct timestamp', async () => {
    const client = createClient()
    const before = Math.floor(Date.now() / 1000) - 1
    const msg = await client.beta.threads.messages.create(threadId, {
      role: 'user',
      content: 'Timestamp check',
    })
    const after = Math.floor(Date.now() / 1000) + 1

    assert.ok(msg.created_at >= before)
    assert.ok(msg.created_at <= after)
  })
})

// ── Group 12: Run response shape ──────────────────────────────────

describe('Run response shape', () => {
  test('completed run has all expected fields', async () => {
    const client = createClient()
    const assistant = await client.beta.assistants.create({
      model: 'gpt-4o-mini',
      instructions: 'Reply briefly.',
    })

    const thread = await client.beta.threads.create({
      metadata: { assistantId: assistant.id },
    })

    await client.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: 'hi',
    })

    const run = await client.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistant.id,
    })

    // Core fields
    assert.equal(run.object, 'thread.run')
    assert.equal(run.status, 'completed')
    assert.equal(run.thread_id, thread.id)
    assert.equal(run.assistant_id, assistant.id)
    assert.ok(run.created_at > 0)
    assert.ok(run.model)

    // Timestamps
    assert.ok(run.expires_at)
    assert.equal(run.cancelled_at, null)
    assert.equal(run.failed_at, null)

    // Defaults
    assert.equal(run.tool_choice, 'auto')
    assert.equal(run.parallel_tool_calls, true)
    assert.deepEqual(run.truncation_strategy, { type: 'auto', last_messages: null })
    assert.equal(run.response_format, 'auto')

    // Cleanup
    await prisma.thread.delete({ where: { id: thread.id } })
    await client.beta.assistants.delete(assistant.id)
  })
})

// ── Group 13: Run step details ────────────────────────────────────

describe('Run step details', () => {
  test('message_creation step has correct shape', async () => {
    const client = createClient()
    const assistant = await client.beta.assistants.create({
      model: 'gpt-4o-mini',
      instructions: 'Reply briefly.',
    })

    const thread = await client.beta.threads.create({
      metadata: { assistantId: assistant.id },
    })

    await client.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: 'hi',
    })

    const run = await client.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistant.id,
    })

    const steps = await client.beta.threads.runs.steps.list(run.id, {
      thread_id: thread.id,
    })

    const messageStep = steps.data.find((s: any) => s.type === 'message_creation')
    assert.ok(messageStep, 'Should have a message_creation step')
    assert.equal(messageStep.object, 'thread.run.step')
    assert.equal(messageStep.run_id, run.id)
    assert.equal(messageStep.thread_id, thread.id)
    assert.equal(messageStep.assistant_id, assistant.id)
    assert.ok(messageStep.step_details)
    assert.equal(messageStep.step_details.type, 'message_creation')

    // Cleanup
    await prisma.thread.delete({ where: { id: thread.id } })
    await client.beta.assistants.delete(assistant.id)
  })

  test('tool_calls step has correct shape after tool call flow', async () => {
    const client = createClient()
    const tools: OpenAI.Beta.Threads.Runs.RunCreateParams['tools'] = [
      {
        type: 'function',
        function: {
          name: 'lookup',
          description: 'Look up info',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        },
      },
    ]

    const assistant = await client.beta.assistants.create({
      model: 'gpt-4o-mini',
      instructions: 'Always use the lookup tool, then answer.',
    })

    const thread = await client.beta.threads.create({
      metadata: { assistantId: assistant.id },
    })

    await client.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: 'Look up the population of Tokyo',
    })

    const run = await client.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistant.id,
      tools,
    })

    assert.equal(run.status, 'requires_action')
    const toolCall = run.required_action!.submit_tool_outputs.tool_calls[0]

    await client.beta.threads.runs.submitToolOutputsAndPoll(run.id, {
      thread_id: thread.id,
      tool_outputs: [
        {
          tool_call_id: toolCall.id,
          output: JSON.stringify({ population: '14 million' }),
        },
      ],
    })

    const steps = await client.beta.threads.runs.steps.list(run.id, {
      thread_id: thread.id,
    })

    const toolStep = steps.data.find((s: any) => s.type === 'tool_calls')
    assert.ok(toolStep, 'Should have a tool_calls step')
    assert.equal(toolStep.step_details.type, 'tool_calls')

    // Cleanup
    await prisma.thread.delete({ where: { id: thread.id } })
    await client.beta.assistants.delete(assistant.id)
  })
})

// ── Group 14: Runs pagination ─────────────────────────────────────

describe('Runs pagination', () => {
  test('list runs respects limit', async () => {
    const client = createClient()
    const assistant = await client.beta.assistants.create({
      model: 'gpt-4o-mini',
      instructions: 'Reply briefly.',
    })

    const thread = await client.beta.threads.create({
      metadata: { assistantId: assistant.id },
    })

    await client.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: 'hi',
    })

    // Create two runs
    await client.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistant.id,
    })
    await client.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: 'again',
    })
    await client.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistant.id,
    })

    const limited = await client.beta.threads.runs.list(thread.id, { limit: 1 })
    assert.equal(limited.data.length, 1)
    assert.equal(limited.has_more, true)

    const all = await client.beta.threads.runs.list(thread.id)
    assert.ok(all.data.length >= 2)

    // Cleanup
    await prisma.thread.delete({ where: { id: thread.id } })
    await client.beta.assistants.delete(assistant.id)
  })
})

// ── Group 15: Empty list responses ────────────────────────────────

describe('Empty list responses', () => {
  test('empty messages list', async () => {
    const client = createClient()
    const assistant = await prisma.assistant.create({
      data: { modelSlug: 'gpt-4o-mini' },
    })
    const thread = await prisma.thread.create({
      data: { assistantId: assistant.id },
    })

    const list = await client.beta.threads.messages.list(thread.id)

    assert.ok(Array.isArray(list.data))
    assert.equal(list.data.length, 0)
    assert.equal(list.has_more, false)

    // Cleanup
    await prisma.thread.delete({ where: { id: thread.id } })
    await prisma.assistant.delete({ where: { id: assistant.id } })
  })

  test('empty runs list', async () => {
    const client = createClient()
    const assistant = await prisma.assistant.create({
      data: { modelSlug: 'gpt-4o-mini' },
    })
    const thread = await prisma.thread.create({
      data: { assistantId: assistant.id },
    })

    const list = await client.beta.threads.runs.list(thread.id)

    assert.ok(Array.isArray(list.data))
    assert.equal(list.data.length, 0)
    assert.equal(list.has_more, false)

    // Cleanup
    await prisma.thread.delete({ where: { id: thread.id } })
    await prisma.assistant.delete({ where: { id: assistant.id } })
  })
})
