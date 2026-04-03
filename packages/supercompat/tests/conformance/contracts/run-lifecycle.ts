import type OpenAI from 'openai'
import assert from 'node:assert/strict'
import { config } from '../lib/config'
import {
  assertRunShape,
  assertMessageShape,
  assertRunStepShape,
  assertStreamEvent,
  assertEventOrder,
  assertPaginatedList,
  collectStreamEvents,
} from '../lib/assertions'
import { cleanup } from '../lib/clients'
import * as fixtures from '../lib/fixtures'

export type Contract = (client: OpenAI) => Promise<void>

export const simpleRunPoll: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: config.model,
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
    model: config.model,
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

export const runStreamHelper: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: config.model,
    instructions: fixtures.instructions.noTools,
  })
  const thread = await client.beta.threads.create()
  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: fixtures.prompts.simple,
  })

  // Use runs.stream() helper instead of create({ stream: true })
  const stream = client.beta.threads.runs.stream(thread.id, {
    assistant_id: assistant.id,
  })

  const events = await collectStreamEvents(stream)

  assertEventOrder(events, [
    'thread.run.created',
    'thread.run.in_progress',
    'thread.message.created',
    'thread.message.completed',
    'thread.run.completed',
  ])

  const deltas = events.filter(e => e.event === 'thread.message.delta')
  assert.ok(deltas.length > 0, 'Should have message deltas')

  const runCompleted = events.find(e => e.event === 'thread.run.completed')
  assert.equal(runCompleted!.data.status, 'completed')

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}

export const submitToolOutputsStream: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: config.model,
    instructions: fixtures.instructions.forceWeatherTool,
    tools: [fixtures.weatherTool],
  })
  const thread = await client.beta.threads.create()
  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: fixtures.prompts.weather,
  })

  // Use stream helper for initial run
  const runStream = client.beta.threads.runs.stream(thread.id, {
    assistant_id: assistant.id,
    tools: [fixtures.weatherTool],
  })

  const events = await collectStreamEvents(runStream)
  const requiresAction = events.find(e => e.event === 'thread.run.requires_action')
  assert.ok(requiresAction, 'Should have requires_action event')

  const tc = requiresAction!.data.required_action.submit_tool_outputs.tool_calls[0]
  assert.equal(tc.function.name, 'get_weather')

  // Use submitToolOutputsStream helper
  const submitStream = client.beta.threads.runs.submitToolOutputsStream(
    requiresAction!.data.id,
    {
      thread_id: thread.id,
      tool_outputs: [{ tool_call_id: tc.id, output: fixtures.weatherToolOutput }],
    },
  )

  const submitEvents = await collectStreamEvents(submitStream)

  const completed = submitEvents.find(e => e.event === 'thread.run.completed')
  assert.ok(completed, 'Should have run.completed after tool output submission')
  assert.equal(completed!.data.status, 'completed')

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}

export const multiTurnConversation: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: config.model,
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

export const runsList: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: config.model,
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
  assert.equal(run.status, 'completed')

  const list = await client.beta.threads.runs.list(thread.id)

  assertPaginatedList(list, 'runs list')
  assert.ok(list.data.length >= 1, `Should have at least 1 run, got ${list.data.length}`)

  const found = list.data.find(r => r.id === run.id)
  assert.ok(found, 'Listed runs should contain the created run')
  assertRunShape(found, 'listed run')
  assert.equal(found.status, 'completed')
  assert.equal(found.thread_id, thread.id)
  assert.equal(found.assistant_id, assistant.id)

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}

export const createThreadAndRun: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: config.model,
    instructions: fixtures.instructions.noTools,
  })

  const run = await client.beta.threads.createAndRunPoll({
    assistant_id: assistant.id,
    thread: {
      messages: [{ role: 'user' as const, content: fixtures.prompts.simple }],
    },
  })

  assertRunShape(run, 'createThreadAndRun')
  assert.equal(run.status, 'completed')
  assert.equal(run.assistant_id, assistant.id)
  assert.ok(run.thread_id, 'Run should have a thread_id')

  // Verify the thread has messages
  const messages = await client.beta.threads.messages.list(run.thread_id)
  assert.ok(messages.data.length >= 2, `Should have user + assistant messages, got ${messages.data.length}`)

  const userMsg = messages.data.find(m => m.role === 'user')
  assert.ok(userMsg, 'Should have user message')

  const assistantMsg = messages.data.find(m => m.role === 'assistant')
  assert.ok(assistantMsg, 'Should have assistant message')
  assert.equal(assistantMsg.run_id, run.id)

  await cleanup(client, { assistantId: assistant.id, threadId: run.thread_id })
}

export const createAndRunStream: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: config.model,
    instructions: fixtures.instructions.noTools,
  })

  const stream = await client.beta.threads.createAndRunStream({
    assistant_id: assistant.id,
    thread: {
      messages: [{ role: 'user' as const, content: fixtures.prompts.simple }],
    },
  })

  const events = await collectStreamEvents(stream)

  // Should have run lifecycle events
  assertEventOrder(events, [
    'thread.run.created',
    'thread.run.in_progress',
    'thread.message.created',
    'thread.message.completed',
    'thread.run.completed',
  ])

  // Run completed
  const runCompleted = events.find(e => e.event === 'thread.run.completed')
  assert.ok(runCompleted, 'Should have run.completed event')
  assertRunShape(runCompleted!.data, 'run.completed')
  assert.equal(runCompleted!.data.status, 'completed')

  // Should have deltas
  const deltas = events.filter(e => e.event === 'thread.message.delta')
  assert.ok(deltas.length > 0, 'Should have message deltas')

  // Get thread_id from run for cleanup
  const threadId = runCompleted!.data.thread_id
  assert.ok(threadId, 'Run should have thread_id')

  await cleanup(client, { assistantId: assistant.id, threadId })
}
