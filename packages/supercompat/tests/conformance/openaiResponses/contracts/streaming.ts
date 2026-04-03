import type OpenAI from 'openai'
import assert from 'node:assert/strict'
import { config } from '../lib/config'
import {
  assertResponseShape,
  assertStreamEvent,
  assertStreamEventOrder,
  collectResponseStreamEvents,
} from '../lib/assertions'

export type ResponsesContract = (client: OpenAI) => Promise<void>

export const streamResponse: ResponsesContract = async (client) => {
  const stream = await client.responses.create({
    model: config.model,
    input: 'Reply with exactly: Hello there!',
    stream: true,
  })

  const events = await collectResponseStreamEvents(stream)

  for (const event of events) {
    assertStreamEvent(event, 'stream event')
  }

  // Verify event ordering
  assertStreamEventOrder(events, [
    'response.created',
    'response.in_progress',
    'response.output_item.added',
    'response.output_text.delta',
    'response.output_text.done',
    'response.output_item.done',
    'response.completed',
  ])

  // response.completed should have the full response
  const completed = events.find(e => e.type === 'response.completed')
  assert.ok(completed, 'Should have response.completed event')
  assertResponseShape(completed.response, 'completed response')
  assert.equal(completed.response.status, 'completed')
}

export const streamDeltaAccumulation: ResponsesContract = async (client) => {
  const stream = await client.responses.create({
    model: config.model,
    input: 'Reply with exactly: Hello there!',
    stream: true,
  })

  const events = await collectResponseStreamEvents(stream)

  // Collect all text deltas
  const deltas = events
    .filter(e => e.type === 'response.output_text.delta')
    .map(e => e.delta)

  assert.ok(deltas.length > 0, 'Should have text deltas')

  // Accumulate delta text
  const accumulated = deltas.join('')

  // Get final text from output_text.done
  const done = events.find(e => e.type === 'response.output_text.done')
  assert.ok(done, 'Should have output_text.done event')

  assert.equal(accumulated, done.text, 'Accumulated deltas should match final text')
}

export const previousResponseIdChaining: ResponsesContract = async (client) => {
  // Turn 1
  const response1 = await client.responses.create({
    model: config.model,
    input: 'My name is Bob.',
    instructions: 'Remember the user\'s name. Be concise.',
  })

  assertResponseShape(response1, 'turn 1')

  // Turn 2 — chain via previous_response_id
  const response2 = await client.responses.create({
    model: config.model,
    input: 'What is my name?',
    instructions: 'Be concise. Reply with just the name.',
    previous_response_id: response1.id,
  })

  assertResponseShape(response2, 'turn 2')
  assert.equal(response2.status, 'completed')

  const messageItem = response2.output.find((o: any) => o.type === 'message')
  assert.ok(messageItem, 'Should have message')
  const text = messageItem.content[0]?.text?.toLowerCase() ?? ''
  assert.ok(text.includes('bob'), `Should remember name 'Bob'. Got: "${text.slice(0, 100)}"`)
}

export const includeParam: ResponsesContract = async (client) => {
  // Create a response with include param for detailed output
  const response = await client.responses.create({
    model: config.model,
    input: 'Say hello.',
    include: ['message.input_image.image_url'],
  })

  // The response should still work — include just controls what extra data is returned
  assertResponseShape(response, 'include')
  assert.equal(response.status, 'completed')
  assert.ok(response.output.length > 0, 'Should have output')
}
