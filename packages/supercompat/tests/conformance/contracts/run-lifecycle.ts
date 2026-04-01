import type OpenAI from 'openai'
import assert from 'node:assert/strict'
import {
  assertRunShape,
  assertMessageShape,
  assertRunStepShape,
  assertStreamEvent,
  assertEventOrder,
  collectStreamEvents,
} from '../lib/assertions'
import { cleanup } from '../lib/clients'
import * as fixtures from '../lib/fixtures'

export type Contract = (client: OpenAI) => Promise<void>

export const simpleRunPoll: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: 'gpt-4.1-mini',
    instructions: fixtures.instructions.noTools,
  })
  const thread = await client.beta.threads.create()
  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: fixtures.prompts.simple,
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
  })

  // Run shape and status
  assertRunShape(run, 'completed run')
  assert.equal(run.status, 'completed')
  assert.equal(run.thread_id, thread.id)
  assert.equal(run.assistant_id, assistant.id)
  assert.ok(run.completed_at, 'should have completed_at')
  assert.ok(run.usage, 'completed run should have usage')

  // Messages after run
  const messages = await client.beta.threads.messages.list(thread.id)
  assert.ok(messages.data.length >= 2, `Should have user + assistant messages, got ${messages.data.length}`)

  const userMsg = messages.data.find(m => m.role === 'user')
  assert.ok(userMsg, 'Should have user message')
  assertMessageShape(userMsg, 'user message')

  const assistantMsg = messages.data.find(m => m.role === 'assistant')
  assert.ok(assistantMsg, 'Should have assistant message')
  assertMessageShape(assistantMsg, 'assistant message')
  assert.equal(assistantMsg.run_id, run.id)
  assert.equal(assistantMsg.assistant_id, assistant.id)
  assert.ok(assistantMsg.content.length > 0, 'Assistant message should have content')
  assert.equal(assistantMsg.content[0].type, 'text')

  // Run steps
  const steps = await client.beta.threads.runs.steps.list(run.id, { thread_id: thread.id })
  assert.ok(steps.data.length >= 1, 'Should have at least 1 step')

  const messageStep = steps.data.find(s => s.type === 'message_creation')
  assert.ok(messageStep, 'Should have message_creation step')
  assertRunStepShape(messageStep, 'message_creation step')
  assert.equal(messageStep.status, 'completed')
  assert.equal(messageStep.run_id, run.id)
  assert.equal(messageStep.thread_id, thread.id)
  assert.equal(messageStep.step_details.message_creation.message_id, assistantMsg.id)

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}

export const simpleRunStream: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: 'gpt-4.1-mini',
    instructions: fixtures.instructions.noTools,
  })
  const thread = await client.beta.threads.create()
  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: fixtures.prompts.simple,
  })

  const stream = await client.beta.threads.runs.create(thread.id, {
    assistant_id: assistant.id,
    stream: true,
  })

  const events = await collectStreamEvents(stream)

  // Every event should have correct shape
  for (const event of events) {
    assertStreamEvent(event, 'stream event')
  }

  // Event ordering
  assertEventOrder(events, [
    'thread.run.created',
    'thread.run.in_progress',
    'thread.message.created',
    'thread.message.completed',
    'thread.run.completed',
  ])

  // Run created event has Run shape
  const runCreated = events.find(e => e.event === 'thread.run.created')
  assertRunShape(runCreated!.data, 'run.created data')

  // Run completed event has usage
  const runCompleted = events.find(e => e.event === 'thread.run.completed')
  assertRunShape(runCompleted!.data, 'run.completed data')
  assert.equal(runCompleted!.data.status, 'completed')

  // Message delta events exist
  const deltas = events.filter(e => e.event === 'thread.message.delta')
  assert.ok(deltas.length > 0, 'Should have message delta events')

  // Message completed has content
  const msgCompleted = events.find(e => e.event === 'thread.message.completed')
  assertMessageShape(msgCompleted!.data, 'message.completed data')
  assert.ok(msgCompleted!.data.content.length > 0)

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}

export const multiTurnConversation: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: 'gpt-4.1-mini',
    instructions: 'Be concise. Reply in one sentence.',
  })
  const thread = await client.beta.threads.create()

  // Turn 1
  await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'Say hello.' })
  const run1 = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
  })
  assert.equal(run1.status, 'completed')

  // Turn 2
  await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'Say goodbye.' })
  const run2 = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
  })
  assert.equal(run2.status, 'completed')

  // Both turns should produce messages
  const messages = await client.beta.threads.messages.list(thread.id)
  const userMessages = messages.data.filter(m => m.role === 'user')
  const assistantMessages = messages.data.filter(m => m.role === 'assistant')

  assert.equal(userMessages.length, 2, 'Should have 2 user messages')
  assert.equal(assistantMessages.length, 2, 'Should have 2 assistant messages')

  // Each assistant message should reference a different run
  const runIds = new Set(assistantMessages.map(m => m.run_id))
  assert.equal(runIds.size, 2, 'Each assistant message should have a different run_id')

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}
