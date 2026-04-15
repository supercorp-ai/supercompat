import type OpenAI from 'openai'
import { config } from './lib/config'
import {
  assertAssistantShape,
  assertThreadShape,
  assertMessageShape,
  assertMessageContentShape,
  assertPaginatedList,
} from './lib/assertions'
import assert from 'node:assert/strict'

export type Contract = (client: OpenAI) => Promise<void>

// --- Assistants ---

export const createAssistant: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: config.model,
    name: 'Conformance Test',
    instructions: 'You are a test assistant.',
    description: 'For testing',
    metadata: { env: 'test', purpose: 'conformance' },
  })

  assertAssistantShape(assistant, 'create')
  assert.equal(assistant.name, 'Conformance Test')
  assert.equal(assistant.instructions, 'You are a test assistant.')
  assert.equal(assistant.description, 'For testing')
  assert.ok(typeof assistant.model === 'string' && assistant.model.length > 0, 'model should be a non-empty string')
  assert.deepEqual(assistant.metadata, { env: 'test', purpose: 'conformance' })
  assert.deepEqual(assistant.tools, [])

  await client.beta.assistants.delete(assistant.id)
}

export const retrieveAssistant: Contract = async (client) => {
  const created = await client.beta.assistants.create({
    model: config.model,
    name: 'Retrieve Test',
  })

  const retrieved = await client.beta.assistants.retrieve(created.id)

  assertAssistantShape(retrieved, 'retrieve')
  assert.equal(retrieved.id, created.id)
  assert.equal(retrieved.name, 'Retrieve Test')
  assert.equal(retrieved.model, created.model)
  assert.equal(retrieved.created_at, created.created_at)

  await client.beta.assistants.delete(created.id)
}

export const updateAssistant: Contract = async (client) => {
  const created = await client.beta.assistants.create({
    model: config.model,
    name: 'Before Update',
    instructions: 'Original instructions',
  })

  const updated = await client.beta.assistants.update(created.id, {
    name: 'After Update',
    metadata: { updated: 'true' },
  })

  assertAssistantShape(updated, 'update')
  assert.equal(updated.id, created.id)
  assert.equal(updated.name, 'After Update')
  // Instructions should be preserved when not changed
  assert.equal(updated.instructions, 'Original instructions')
  assert.deepEqual(updated.metadata, { updated: 'true' })

  await client.beta.assistants.delete(created.id)
}

export const listAssistants: Contract = async (client) => {
  const a1 = await client.beta.assistants.create({ model: config.model, name: 'List A' })
  const a2 = await client.beta.assistants.create({ model: config.model, name: 'List B' })

  const list = await client.beta.assistants.list({ limit: 100 })

  assertPaginatedList(list, 'list')
  assert.ok(list.data.length >= 2, `Should have at least 2 assistants, got ${list.data.length}`)
  assert.ok(list.data.some(a => a.id === a1.id), 'Should include first assistant')
  assert.ok(list.data.some(a => a.id === a2.id), 'Should include second assistant')

  for (const a of list.data) {
    assertAssistantShape(a, 'list item')
  }

  await client.beta.assistants.delete(a1.id)
  await client.beta.assistants.delete(a2.id)
}

export const deleteAssistant: Contract = async (client) => {
  const created = await client.beta.assistants.create({ model: config.model, name: 'Delete Me' })
  const result = await client.beta.assistants.delete(created.id)

  assert.equal(result.id, created.id)
  assert.equal(result.deleted, true)
}

// --- Threads ---

export const createThread: Contract = async (client) => {
  const thread = await client.beta.threads.create({
    metadata: { test: 'true' },
  })

  assertThreadShape(thread, 'create')
  assert.deepEqual(thread.metadata, { test: 'true' })

  await client.beta.threads.delete(thread.id)
}

export const retrieveThread: Contract = async (client) => {
  const created = await client.beta.threads.create()
  const retrieved = await client.beta.threads.retrieve(created.id)

  assertThreadShape(retrieved, 'retrieve')
  assert.equal(retrieved.id, created.id)
  assert.equal(retrieved.created_at, created.created_at)

  await client.beta.threads.delete(created.id)
}

export const updateThread: Contract = async (client) => {
  const created = await client.beta.threads.create()
  const updated = await client.beta.threads.update(created.id, {
    metadata: { updated: 'true' },
  })

  assertThreadShape(updated, 'update')
  assert.equal(updated.id, created.id)
  assert.deepEqual(updated.metadata, { updated: 'true' })

  await client.beta.threads.delete(created.id)
}

// --- Messages ---

export const createMessage: Contract = async (client) => {
  const thread = await client.beta.threads.create()

  const message = await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Hello from conformance test',
    metadata: { source: 'test' },
  })

  assertMessageShape(message, 'create')
  assert.equal(message.role, 'user')
  assert.equal(message.thread_id, thread.id)
  assert.equal(message.content[0].type, 'text')
  assertMessageContentShape(message.content[0], 'create content')
  if (message.content[0].type === 'text') {
    assert.equal(message.content[0].text.value, 'Hello from conformance test')
  }
  assert.equal(message.run_id, null)
  assert.equal(message.assistant_id, null)
  assert.deepEqual(message.metadata, { source: 'test' })

  await client.beta.threads.delete(thread.id)
}

export const listMessages: Contract = async (client) => {
  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'First' })
  await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'Second' })
  await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'Third' })

  // Default order: desc (newest first)
  const list = await client.beta.threads.messages.list(thread.id)
  assertPaginatedList(list, 'list')
  assert.equal(list.data.length, 3)

  for (const msg of list.data) {
    assertMessageShape(msg, 'list item')
    assert.equal(msg.thread_id, thread.id)
    assert.equal(msg.role, 'user')
  }

  // Desc order: newest first
  if (list.data[0].content[0].type === 'text') {
    assert.equal(list.data[0].content[0].text.value, 'Third')
  }
  if (list.data[2].content[0].type === 'text') {
    assert.equal(list.data[2].content[0].text.value, 'First')
  }

  // Pagination
  const page1 = await client.beta.threads.messages.list(thread.id, { limit: 1 })
  assert.equal(page1.data.length, 1)

  await client.beta.threads.delete(thread.id)
}

export const retrieveMessage: Contract = async (client) => {
  const thread = await client.beta.threads.create()
  const created = await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Retrieve me',
  })

  const retrieved = await client.beta.threads.messages.retrieve(created.id, { thread_id: thread.id })

  assertMessageShape(retrieved, 'retrieve')
  assert.equal(retrieved.id, created.id)
  assert.equal(retrieved.thread_id, thread.id)
  if (retrieved.content[0].type === 'text') {
    assert.equal(retrieved.content[0].text.value, 'Retrieve me')
  }

  await client.beta.threads.delete(thread.id)
}

export const updateMessage: Contract = async (client) => {
  const thread = await client.beta.threads.create()
  const created = await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Update my metadata',
    metadata: { version: '1' },
  })

  assert.deepEqual(created.metadata, { version: '1' })

  const updated = await client.beta.threads.messages.update(created.id, {
    thread_id: thread.id,
    metadata: { version: '2', extra: 'field' },
  })

  assertMessageShape(updated, 'update')
  assert.equal(updated.id, created.id)
  assert.equal(updated.thread_id, thread.id)
  assert.deepEqual(updated.metadata, { version: '2', extra: 'field' })

  await client.beta.threads.delete(thread.id)
}

export const deleteMessage: Contract = async (client) => {
  const thread = await client.beta.threads.create()
  const created = await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Delete me',
  })

  const result = await client.beta.threads.messages.delete(created.id, { thread_id: thread.id })

  assert.equal(result.id, created.id)
  assert.equal(result.deleted, true)

  await client.beta.threads.delete(thread.id)
}
