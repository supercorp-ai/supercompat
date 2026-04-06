import type OpenAI from 'openai'
import assert from 'node:assert/strict'
import { config } from './lib/config'
import { assertResponseShape, assertConversationShape } from './lib/assertions'

export type ResponsesContract = (client: OpenAI) => Promise<void>

export const createConversation: ResponsesContract = async (client) => {
  const conversation = await client.conversations.create({})

  assertConversationShape(conversation, 'create')

  await client.conversations.delete(conversation.id)
}

export const retrieveConversation: ResponsesContract = async (client) => {
  const created = await client.conversations.create({})
  const retrieved = await client.conversations.retrieve(created.id)

  assertConversationShape(retrieved, 'retrieve')
  assert.equal(retrieved.id, created.id)

  await client.conversations.delete(created.id)
}

export const updateConversation: ResponsesContract = async (client) => {
  const created = await client.conversations.create({})

  const updated = await client.conversations.update(created.id, {
    metadata: { test: 'value' },
  })

  assertConversationShape(updated, 'update')
  assert.equal(updated.id, created.id)

  await client.conversations.delete(created.id)
}

export const conversationMultiTurn: ResponsesContract = async (client) => {
  // Create a conversation
  const conversation = await client.conversations.create({})

  // Turn 1
  const response1 = await client.responses.create({
    model: config.model,
    input: 'My name is Alice.',
    instructions: 'Remember the user\'s name. Be concise.',
    conversation: conversation.id,
  })

  assertResponseShape(response1, 'turn 1')
  assert.equal(response1.status, 'completed')

  // Turn 2 — should remember context
  const response2 = await client.responses.create({
    model: config.model,
    input: 'What is my name?',
    instructions: 'Be concise. Reply with just the name.',
    conversation: conversation.id,
  })

  assertResponseShape(response2, 'turn 2')
  assert.equal(response2.status, 'completed')

  // Response should mention Alice
  const messageItem = response2.output.find((o: any) => o.type === 'message')
  assert.ok(messageItem, 'Should have message')
  const text = messageItem.content[0]?.text?.toLowerCase() ?? ''
  assert.ok(text.includes('alice'), `Should remember name 'Alice'. Got: "${text.slice(0, 100)}"`)

  await client.conversations.delete(conversation.id)
}

export const conversationItemCreate: ResponsesContract = async (client) => {
  const conversation = await client.conversations.create({})

  // Add items to the conversation (takes an array)
  const result = await client.conversations.items.create(conversation.id, {
    items: [{
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'Hello from items.create' }],
    }],
  })

  assert.ok(Array.isArray(result.data), 'Should return data array')
  assert.ok(result.data.length > 0, 'Should have created items')
  assert.equal(result.data[0].type, 'message')

  await client.conversations.delete(conversation.id)
}

export const conversationItemRetrieve: ResponsesContract = async (client) => {
  const conversation = await client.conversations.create({})

  // Create a response on the conversation to generate items
  await client.responses.create({
    model: config.model,
    input: 'Say hi.',
    conversation: conversation.id,
  })

  // List items — find an assistant message (has a real ID)
  const items: any[] = []
  for await (const item of await client.conversations.items.list(conversation.id)) {
    items.push(item)
  }

  const assistantItem = items.find(i => i.role === 'assistant')
  assert.ok(assistantItem, 'Should have an assistant item')

  // Retrieve it
  const retrieved = await client.conversations.items.retrieve(assistantItem.id, {
    conversation_id: conversation.id,
  })

  assert.equal(retrieved.id, assistantItem.id)
  assert.equal(typeof retrieved.type, 'string')

  await client.conversations.delete(conversation.id)
}

export const conversationItemDelete: ResponsesContract = async (client) => {
  const conversation = await client.conversations.create({})

  // Add items
  const created = await client.conversations.items.create(conversation.id, {
    items: [{
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'To be deleted' }],
    }],
  })

  const itemId = created.data[0].id

  // Delete it — returns the updated conversation
  const result = await client.conversations.items.delete(itemId, {
    conversation_id: conversation.id,
  })

  // Verify item is gone by listing
  const remaining: any[] = []
  for await (const item of await client.conversations.items.list(conversation.id)) {
    remaining.push(item)
  }
  const deleted = remaining.find((i: any) => i.id === itemId)
  assert.equal(deleted, undefined, 'Deleted item should not be in list')

  await client.conversations.delete(conversation.id)
}

export const conversationInputItems: ResponsesContract = async (client) => {
  const conversation = await client.conversations.create({})

  await client.responses.create({
    model: config.model,
    input: 'Hello!',
    conversation: conversation.id,
  })

  // List items in the conversation
  const items = await client.conversations.items.list(conversation.id)

  const itemsList: any[] = []
  for await (const item of items) {
    itemsList.push(item)
  }

  // Should have at least the user input and assistant output
  assert.ok(itemsList.length >= 2, `Should have at least 2 items, got ${itemsList.length}`)

  await client.conversations.delete(conversation.id)
}
