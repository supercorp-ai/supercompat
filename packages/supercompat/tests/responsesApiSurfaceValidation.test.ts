import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import OpenAI from 'openai'
import { PrismaClient } from '@prisma/client'

// Test that both import paths work
import {
  createClient as createResponsesClient,
  openaiClientAdapter as responsesOpenaiClientAdapter,
  prismaStorageAdapter as responsesPrismaStorageAdapter,
  completionsRunAdapter as responsesCompletionsRunAdapter,
} from '../src/openaiResponses/index'

import {
  createClient as createAssistantsClient,
  openaiClientAdapter as assistantsOpenaiClientAdapter,
  prismaStorageAdapter as assistantsPrismaStorageAdapter,
  completionsRunAdapter as assistantsCompletionsRunAdapter,
} from '../src/openaiAssistants/index'

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

const makeResponsesClient = () => {
  const realOpenAI = new OpenAI({ apiKey })
  return createResponsesClient({
    client: responsesOpenaiClientAdapter({ openai: realOpenAI }),
    storage: responsesPrismaStorageAdapter({ prisma }),
    runAdapter: responsesCompletionsRunAdapter(),
  })
}

const makeAssistantsClient = () => {
  const realOpenAI = new OpenAI({ apiKey })
  return createAssistantsClient({
    client: assistantsOpenaiClientAdapter({ openai: realOpenAI }),
    storage: assistantsPrismaStorageAdapter({ prisma }),
    runAdapter: assistantsCompletionsRunAdapter(),
  })
}

after(async () => {
  await prisma.$disconnect()
})

// ── Response Surface ───────────────────────────────────────────────

describe('Response Surface Validation', () => {
  test('non-streaming response has correct shape', async () => {
    const client = makeResponsesClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say "test".',
    })

    // Must have these top-level fields
    assert.equal(response.object, 'response')
    assert.ok(response.id)
    assert.ok(typeof response.created_at === 'number')
    assert.ok(['completed', 'failed', 'cancelled', 'incomplete', 'in_progress', 'queued'].includes(response.status))
    assert.ok(typeof response.model === 'string')
    assert.ok(Array.isArray(response.output))

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('output message has correct surface', async () => {
    const client = makeResponsesClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say hi.',
    })

    const msg = response.output.find((item: any) => item.type === 'message')
    assert.ok(msg)
    assert.equal(msg.type, 'message')
    assert.ok(msg.role)
    assert.ok(Array.isArray(msg.content))
    assert.ok(msg.content.length > 0)
    assert.equal(msg.content[0].type, 'output_text')
    assert.ok(typeof msg.content[0].text === 'string')

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('response has error field (null when successful)', async () => {
    const client = makeResponsesClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
    })

    assert.equal(response.error, null)

    await prisma.response.delete({ where: { id: response.id } })
  })
})

// ── Streaming Events Surface ───────────────────────────────────────

describe('Streaming Events Surface', () => {
  test('stream has response.created with response object', async () => {
    const client = makeResponsesClient()
    const events: any[] = []

    const stream = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
      stream: true,
    })

    for await (const event of stream) {
      events.push(event)
    }

    const created = events.find((e) => e.type === 'response.created')
    assert.ok(created)
    assert.ok(created.response)
    assert.equal(created.response.object, 'response')

    if (created?.response?.id) {
      await prisma.response.delete({ where: { id: created.response.id } }).catch(() => {})
    }
  })

  test('stream has response.in_progress with response object', async () => {
    const client = makeResponsesClient()
    const events: any[] = []

    const stream = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
      stream: true,
    })

    for await (const event of stream) {
      events.push(event)
    }

    const inProgress = events.find((e) => e.type === 'response.in_progress')
    assert.ok(inProgress)
    assert.ok(inProgress.response)
    assert.equal(inProgress.response.status, 'in_progress')

    const created = events.find((e) => e.type === 'response.created')
    if (created?.response?.id) {
      await prisma.response.delete({ where: { id: created.response.id } }).catch(() => {})
    }
  })

  test('stream output_item.added has item object', async () => {
    const client = makeResponsesClient()
    const events: any[] = []

    const stream = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
      stream: true,
    })

    for await (const event of stream) {
      events.push(event)
    }

    const added = events.find((e) => e.type === 'response.output_item.added')
    assert.ok(added)
    assert.ok(added.item)
    assert.equal(added.item.type, 'message')

    const created = events.find((e) => e.type === 'response.created')
    if (created?.response?.id) {
      await prisma.response.delete({ where: { id: created.response.id } }).catch(() => {})
    }
  })

  test('stream output_text.delta has delta string', async () => {
    const client = makeResponsesClient()
    const events: any[] = []

    const stream = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'Say "hello".',
      stream: true,
    })

    for await (const event of stream) {
      events.push(event)
    }

    const delta = events.find((e) => e.type === 'response.output_text.delta')
    assert.ok(delta)
    assert.ok(typeof delta.delta === 'string')
    assert.ok(typeof delta.output_index === 'number')
    assert.ok(typeof delta.content_index === 'number')

    const created = events.find((e) => e.type === 'response.created')
    if (created?.response?.id) {
      await prisma.response.delete({ where: { id: created.response.id } }).catch(() => {})
    }
  })

  test('stream output_text.done has text string', async () => {
    const client = makeResponsesClient()
    const events: any[] = []

    const stream = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
      stream: true,
    })

    for await (const event of stream) {
      events.push(event)
    }

    const done = events.find((e) => e.type === 'response.output_text.done')
    assert.ok(done)
    assert.ok(typeof done.text === 'string')

    const created = events.find((e) => e.type === 'response.created')
    if (created?.response?.id) {
      await prisma.response.delete({ where: { id: created.response.id } }).catch(() => {})
    }
  })

  test('stream output_item.done has completed item', async () => {
    const client = makeResponsesClient()
    const events: any[] = []

    const stream = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
      stream: true,
    })

    for await (const event of stream) {
      events.push(event)
    }

    const itemDone = events.find((e) => e.type === 'response.output_item.done')
    assert.ok(itemDone)
    assert.ok(itemDone.item)
    assert.equal(itemDone.item.status, 'completed')

    const created = events.find((e) => e.type === 'response.created')
    if (created?.response?.id) {
      await prisma.response.delete({ where: { id: created.response.id } }).catch(() => {})
    }
  })

  test('stream response.completed has final response', async () => {
    const client = makeResponsesClient()
    const events: any[] = []

    const stream = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
      stream: true,
    })

    for await (const event of stream) {
      events.push(event)
    }

    const completed = events.find((e) => e.type === 'response.completed')
    assert.ok(completed)
    assert.ok(completed.response)
    assert.equal(completed.response.status, 'completed')
    assert.ok(Array.isArray(completed.response.output))

    if (completed?.response?.id) {
      await prisma.response.delete({ where: { id: completed.response.id } }).catch(() => {})
    }
  })

  test('streaming function_call_arguments.delta has correct fields', async () => {
    const client = makeResponsesClient()
    const events: any[] = []

    const stream = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'Always use the tool.',
      input: 'What is 2+2?',
      tools: [{
        type: 'function',
        name: 'calc',
        description: 'Calculate',
        parameters: {
          type: 'object',
          properties: { expr: { type: 'string' } },
          required: ['expr'],
        },
      }],
      stream: true,
    })

    for await (const event of stream) {
      events.push(event)
    }

    const argDelta = events.find((e) => e.type === 'response.function_call_arguments.delta')
    if (argDelta) {
      assert.ok(typeof argDelta.delta === 'string')
      assert.ok(argDelta.item_id)
    }

    const created = events.find((e) => e.type === 'response.created')
    if (created?.response?.id) {
      await prisma.response.delete({ where: { id: created.response.id } }).catch(() => {})
    }
  })
})

// ── Retrieve Surface ───────────────────────────────────────────────

describe('Retrieve Surface', () => {
  test('retrieve has correct shape', async () => {
    const client = makeResponsesClient()
    const created = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
    })

    const retrieved = await client.responses.retrieve(created.id)

    assert.equal(retrieved.object, 'response')
    assert.ok(retrieved.id)
    assert.ok(typeof retrieved.created_at === 'number')
    assert.ok(typeof retrieved.status === 'string')
    assert.ok(typeof retrieved.model === 'string')
    assert.ok(Array.isArray(retrieved.output))

    await prisma.response.delete({ where: { id: created.id } })
  })

  test('input_items list has correct shape', async () => {
    const client = makeResponsesClient()
    const created = await client.responses.create({
      model: 'gpt-4o-mini',
      input: [
        { role: 'user', content: 'test' },
      ],
    })

    const inputItems = await client.responses.inputItems.list(created.id)

    assert.ok(Array.isArray(inputItems.data))
    assert.equal(typeof inputItems.has_more, 'boolean')

    await prisma.response.delete({ where: { id: created.id } })
  })

  test('input_items list has data array', async () => {
    const client = makeResponsesClient()
    const created = await client.responses.create({
      model: 'gpt-4o-mini',
      input: [
        { role: 'user', content: 'test' },
      ],
    })

    const inputItems = await client.responses.inputItems.list(created.id)

    assert.ok(inputItems.data.length > 0)

    await prisma.response.delete({ where: { id: created.id } })
  })
})

// ── Field Values ───────────────────────────────────────────────────

describe('Field Values', () => {
  test('status values are valid', async () => {
    const client = makeResponsesClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
    })

    const validStatuses = ['completed', 'failed', 'cancelled', 'incomplete', 'in_progress', 'queued']
    assert.ok(validStatuses.includes(response.status))

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('output_text type is correct', async () => {
    const client = makeResponsesClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
    })

    const msg = response.output.find((item: any) => item.type === 'message')
    if (msg) {
      const textContent = msg.content.find((c: any) => c.type === 'output_text')
      assert.ok(textContent)
      assert.equal(textContent.type, 'output_text')
      assert.ok(typeof textContent.text === 'string')
    }

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('tool_choice defaults to auto', async () => {
    const client = makeResponsesClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
    })

    assert.equal(response.tool_choice, 'auto')

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('truncation default', async () => {
    const client = makeResponsesClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
    })

    assert.ok(response.truncation)
    assert.equal(response.truncation.type, 'disabled')

    await prisma.response.delete({ where: { id: response.id } })
  })

  test('temperature and top_p defaults', async () => {
    const client = makeResponsesClient()
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hi',
    })

    assert.equal(response.temperature, 1)
    assert.equal(response.top_p, 1)

    await prisma.response.delete({ where: { id: response.id } })
  })
})

// ── Backward Compatibility ─────────────────────────────────────────

describe('Backward Compatibility', () => {
  test('old import path still works', () => {
    assert.ok(supercompat)
    assert.ok(openaiClientAdapter)
    assert.ok(prismaStorageAdapter)
    assert.ok(completionsRunAdapter)
  })

  test('openaiAssistants exports match old exports', () => {
    assert.ok(createAssistantsClient)
    assert.ok(assistantsOpenaiClientAdapter)
    assert.ok(assistantsPrismaStorageAdapter)
    assert.ok(assistantsCompletionsRunAdapter)
  })

  test('openaiResponses exports are available', () => {
    assert.ok(createResponsesClient)
    assert.ok(responsesOpenaiClientAdapter)
    assert.ok(responsesPrismaStorageAdapter)
    assert.ok(responsesCompletionsRunAdapter)
  })

  test('both paths can coexist', () => {
    const realOpenAI = new OpenAI({ apiKey })

    // Assistants client
    const assistantsClient = createAssistantsClient({
      client: assistantsOpenaiClientAdapter({ openai: realOpenAI }),
      storage: assistantsPrismaStorageAdapter({ prisma }),
      runAdapter: assistantsCompletionsRunAdapter(),
    })
    assert.ok(assistantsClient)

    // Responses client
    const responsesClient = createResponsesClient({
      client: responsesOpenaiClientAdapter({ openai: realOpenAI }),
      storage: responsesPrismaStorageAdapter({ prisma }),
      runAdapter: responsesCompletionsRunAdapter(),
    })
    assert.ok(responsesClient)
  })

  test('client adapters are re-exported from both paths', () => {
    // Both should export the same adapters
    assert.ok(assistantsOpenaiClientAdapter)
    assert.ok(responsesOpenaiClientAdapter)
    assert.ok(assistantsCompletionsRunAdapter)
    assert.ok(responsesCompletionsRunAdapter)
  })
})
