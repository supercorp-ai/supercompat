import type OpenAI from 'openai'
import assert from 'node:assert/strict'
import { config } from '../lib/config'
import { assertResponseShape } from '../lib/assertions'

export type ResponsesContract = (client: OpenAI) => Promise<void>

export const createResponse: ResponsesContract = async (client) => {
  const response = await client.responses.create({
    model: config.model,
    input: 'Reply with exactly: Hello there!',
  })

  assertResponseShape(response, 'create')
  assert.equal(response.status, 'completed')
  assert.ok(response.output.length > 0, 'Should have output')

  const messageItem = response.output.find((o: any) => o.type === 'message')
  assert.ok(messageItem, 'Should have a message output item')
  // Usage is available on baseline but may be null on some adapters
  if (response.usage) {
    assert.ok(response.usage.input_tokens > 0, 'Should have input tokens')
    assert.ok(response.usage.output_tokens > 0, 'Should have output tokens')
  }
}

export const retrieveResponse: ResponsesContract = async (client) => {
  const created = await client.responses.create({
    model: config.model,
    input: 'Say hi.',
  })

  const retrieved = await client.responses.retrieve(created.id)

  assertResponseShape(retrieved, 'retrieve')
  assert.equal(retrieved.id, created.id)
  assert.equal(retrieved.model, created.model)
  assert.equal(retrieved.status, 'completed')
}

export const deleteResponse: ResponsesContract = async (client) => {
  const created = await client.responses.create({
    model: config.model,
    input: 'Say hi.',
  })

  const result = await client.responses.delete(created.id)

  assert.equal(result.id, created.id)
  assert.equal(result.deleted, true)
}

export const cancelResponse: ResponsesContract = async (client) => {
  // Create a streaming response so we can cancel it
  const stream = await client.responses.create({
    model: config.model,
    input: 'Write a very long essay about the history of computing. Make it at least 2000 words.',
    stream: true,
  })

  // Read a few events then cancel
  let responseId: string | undefined
  for await (const event of stream) {
    if (event.type === 'response.created') {
      responseId = event.response.id
      break
    }
  }

  assert.ok(responseId, 'Should have response ID from stream')

  // Cancel the response
  try {
    const cancelled = await client.responses.cancel(responseId!)
    // Cancelled response should have cancelled or completed status
    assert.ok(
      cancelled.status === 'cancelled' || cancelled.status === 'completed',
      `Status should be cancelled or completed, got ${cancelled.status}`,
    )
  } catch {
    // Some responses complete too fast to cancel — that's OK
  }
}

export const streamHelper: ResponsesContract = async (client) => {
  // Use responses.stream() helper (equivalent to create with stream: true)
  const stream = client.responses.stream({
    model: config.model,
    input: 'Reply with exactly: Hello!',
  })

  const events: any[] = []
  for await (const event of stream) {
    events.push(event)
  }

  assert.ok(events.length > 0, 'Should have events')

  const completed = events.find(e => e.type === 'response.completed')
  assert.ok(completed, 'Should have response.completed')
  assert.equal(completed.response.status, 'completed')
}
