import type OpenAI from 'openai'
import assert from 'node:assert/strict'
import { config } from './lib/config'
import {
  assertMessageShape,
  assertRunShape,
  assertRunStepShape,
  assertStreamEvent,
  assertEventOrder,
  assertPaginatedList,
  collectStreamEvents,
} from './lib/assertions'
import { cleanup } from './lib/clients'
import * as fixtures from './lib/fixtures'

export type Contract = (client: OpenAI) => Promise<void>

export const metadataRoundTrip: Contract = async (client) => {
  const metadata = { key1: 'value1', key2: 'value2', special: 'with spaces & symbols!' }

  const assistant = await client.beta.assistants.create({
    model: config.model,
    metadata,
  })
  assert.deepEqual(assistant.metadata, metadata)

  const retrieved = await client.beta.assistants.retrieve(assistant.id)
  assert.deepEqual(retrieved.metadata, metadata)

  await client.beta.assistants.delete(assistant.id)
}

export const messageContentPreserved: Contract = async (client) => {
  const thread = await client.beta.threads.create()
  const content = 'Hello with unicode: 你好 and emoji: 🎉 and newlines:\nLine 2\nLine 3'

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content,
  })

  const list = await client.beta.threads.messages.list(thread.id)
  const msg = list.data[0]

  assert.equal(msg.content[0].type, 'text')
  if (msg.content[0].type === 'text') {
    assert.equal(msg.content[0].text.value, content, 'Message content should be preserved exactly')
  }

  await client.beta.threads.delete(thread.id)
}

export const runIdOnMessage: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: config.model,
    instructions: 'Reply concisely.',
  })
  const thread = await client.beta.threads.create()
  await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'Hi' })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
  })

  const messages = await client.beta.threads.messages.list(thread.id)
  const assistantMsg = messages.data.find(m => m.role === 'assistant')

  assert.ok(assistantMsg)
  assert.equal(assistantMsg.run_id, run.id, 'Assistant message run_id should match the run')
  assert.equal(assistantMsg.assistant_id, assistant.id, 'Assistant message assistant_id should match')

  // User message should NOT have run_id
  const userMsg = messages.data.find(m => m.role === 'user')
  assert.equal(userMsg!.run_id, null, 'User message should have null run_id')

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}

export const threadIdConsistency: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: config.model,
    instructions: 'Reply concisely.',
  })
  const thread = await client.beta.threads.create()
  await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'Hi' })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
  })

  // All objects should reference the same thread
  assert.equal(run.thread_id, thread.id)

  const messages = await client.beta.threads.messages.list(thread.id)
  for (const msg of messages.data) {
    assert.equal(msg.thread_id, thread.id, `Message ${msg.id} should reference thread`)
  }

  const steps = await client.beta.threads.runs.steps.list(run.id, { thread_id: thread.id })
  for (const step of steps.data) {
    assert.equal(step.thread_id, thread.id, `Step ${step.id} should reference thread`)
    assert.equal(step.run_id, run.id, `Step ${step.id} should reference run`)
  }

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}

export const messageStepLinkage: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: config.model,
    instructions: 'Reply concisely.',
  })
  const thread = await client.beta.threads.create()
  await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'Hi' })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
  })

  const messages = await client.beta.threads.messages.list(thread.id)
  const assistantMsg = messages.data.find(m => m.role === 'assistant')!

  const steps = await client.beta.threads.runs.steps.list(run.id, { thread_id: thread.id })
  const msgStep = steps.data.find(s => s.type === 'message_creation')!

  assert.equal(
    (msgStep.step_details as any).message_creation.message_id,
    assistantMsg.id,
    'message_creation step should reference the correct message',
  )

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}

export const listOrderDesc: Contract = async (client) => {
  const thread = await client.beta.threads.create()

  const m1 = await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'First' })
  const m2 = await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'Second' })
  const m3 = await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'Third' })

  // Default is desc (newest first)
  const list = await client.beta.threads.messages.list(thread.id)
  assert.equal(list.data.length, 3)
  assert.equal(list.data[0].id, m3.id, 'First item in desc should be newest')
  assert.equal(list.data[2].id, m1.id, 'Last item in desc should be oldest')

  await client.beta.threads.delete(thread.id)
}

export const listOrderAsc: Contract = async (client) => {
  const thread = await client.beta.threads.create()

  const m1 = await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'First' })
  const m2 = await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'Second' })
  const m3 = await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'Third' })

  const list = await client.beta.threads.messages.list(thread.id, { order: 'asc' })
  assert.equal(list.data.length, 3)
  assert.equal(list.data[0].id, m1.id, 'First item in asc should be oldest')
  assert.equal(list.data[2].id, m3.id, 'Last item in asc should be newest')

  await client.beta.threads.delete(thread.id)
}

// --- Pagination with cursor ---

export const paginationWithCursor: Contract = async (client) => {
  const thread = await client.beta.threads.create()

  const m1 = await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'One' })
  const m2 = await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'Two' })
  const m3 = await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'Three' })

  // Page 1: get first item (desc order)
  const page1 = await client.beta.threads.messages.list(thread.id, { limit: 1 })
  assertPaginatedList(page1, 'page1')
  assert.equal(page1.data.length, 1)
  assert.equal(page1.data[0].id, m3.id, 'First page should have newest')
  assert.equal(page1.has_more, true, 'Should have more pages')

  // Page 2: use after cursor
  const page2 = await client.beta.threads.messages.list(thread.id, { limit: 1, after: page1.data[0].id })
  assert.equal(page2.data.length, 1)
  assert.equal(page2.data[0].id, m2.id, 'Second page should have middle item')

  // Page 3
  const page3 = await client.beta.threads.messages.list(thread.id, { limit: 1, after: page2.data[0].id })
  assert.equal(page3.data.length, 1)
  assert.equal(page3.data[0].id, m1.id, 'Third page should have oldest')
  assert.equal(page3.has_more, false, 'Should be last page')

  await client.beta.threads.delete(thread.id)
}

// --- Pagination with before cursor (reverse) ---

export const paginationWithBeforeCursor: Contract = async (client) => {
  const thread = await client.beta.threads.create()

  const m1 = await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'One' })
  const m2 = await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'Two' })
  const m3 = await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'Three' })

  // Default desc order: [m3, m2, m1]
  // "before" returns items appearing before the cursor in the list (i.e. newer items)
  // before: m2 → [m3] (one item before m2 in the desc list)
  const page = await client.beta.threads.messages.list(thread.id, { limit: 1, before: m2.id })
  assert.equal(page.data.length, 1)
  assert.equal(page.data[0].id, m3.id, 'Before m2 should return m3')

  // before: m1 → [m3, m2] (two items before m1)
  const page2 = await client.beta.threads.messages.list(thread.id, { before: m1.id })
  assert.equal(page2.data.length, 2, 'Before oldest should return 2 items')

  // before: m3 → [] (nothing before the newest)
  const page3 = await client.beta.threads.messages.list(thread.id, { before: m3.id })
  assert.equal(page3.data.length, 0, 'Nothing before newest')

  await client.beta.threads.delete(thread.id)
}

// --- Empty thread ---

export const emptyThreadMessages: Contract = async (client) => {
  const thread = await client.beta.threads.create()

  const list = await client.beta.threads.messages.list(thread.id)
  assertPaginatedList(list, 'empty list')
  assert.equal(list.data.length, 0, 'Empty thread should have 0 messages')
  assert.equal(list.has_more, false)

  await client.beta.threads.delete(thread.id)
}

// --- Run retrieve matches poll result ---

export const runRetrieveAfterCompletion: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: config.model,
    instructions: 'Reply concisely.',
  })
  const thread = await client.beta.threads.create()
  await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'Hi' })

  const polled = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
  })

  const retrieved = await client.beta.threads.runs.retrieve(polled.id, { thread_id: thread.id })

  assertRunShape(retrieved, 'retrieved run')
  assert.equal(retrieved.id, polled.id)
  assert.equal(retrieved.status, 'completed')
  assert.equal(retrieved.thread_id, thread.id)
  assert.equal(retrieved.assistant_id, assistant.id)

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}

// --- Stream delta accumulation ---

export const streamDeltaAccumulation: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: config.model,
    instructions: 'Reply with exactly: The quick brown fox jumps over the lazy dog.',
  })
  const thread = await client.beta.threads.create()
  await client.beta.threads.messages.create(thread.id, { role: 'user', content: 'Go.' })

  const stream = await client.beta.threads.runs.create(thread.id, {
    assistant_id: assistant.id,
    stream: true,
  })

  const events = await collectStreamEvents(stream)

  // Accumulate text from deltas
  let accumulated = ''
  for (const event of events) {
    assertStreamEvent(event, 'stream event')
    if (event.event === 'thread.message.delta') {
      const content = event.data?.delta?.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && block.text?.value) {
            accumulated += block.text.value
          }
        }
      }
    }
  }

  // Get the completed message text
  const completed = events.find(e => e.event === 'thread.message.completed')
  assert.ok(completed, 'Should have message.completed event')
  const finalText = (completed!.data.content[0] as any)?.text?.value ?? ''

  // Accumulated deltas should equal the final text
  assert.equal(accumulated, finalText, 'Accumulated deltas should match final message text')
  assert.ok(accumulated.length > 0, 'Should have non-empty text')

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}

// --- Cancel run ---

export const cancelRun: Contract = async (client) => {
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

  // Create run that will pause at requires_action
  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
    tools: [fixtures.weatherTool],
  })
  assert.equal(run.status, 'requires_action')

  // Cancel it
  const cancelled = await client.beta.threads.runs.cancel(run.id, { thread_id: thread.id })
  assertRunShape(cancelled, 'cancelled run')
  assert.ok(
    ['cancelling', 'cancelled'].includes(cancelled.status),
    `Status should be cancelling or cancelled, got ${cancelled.status}`,
  )

  // Poll until fully cancelled
  let final = cancelled
  for (let i = 0; i < 10 && final.status === 'cancelling'; i++) {
    await new Promise(r => setTimeout(r, 500))
    final = await client.beta.threads.runs.retrieve(run.id, { thread_id: thread.id })
  }
  assert.equal(final.status, 'cancelled')

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}

// --- Special characters in tool output ---

export const specialCharsInToolOutput: Contract = async (client) => {
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

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
    tools: [fixtures.weatherTool],
  })

  const tc = run.required_action!.submit_tool_outputs.tool_calls[0]
  const specialOutput = JSON.stringify({
    description: 'Sunny with unicode: 你好 🌞\nTemperature: 72°F\tHumidity: "60%"',
    notes: 'Line1\nLine2\nLine3',
  })

  const completed = await client.beta.threads.runs.submitToolOutputsAndPoll(
    run.id,
    {
      thread_id: thread.id,
      tool_outputs: [{ tool_call_id: tc.id, output: specialOutput }],
    },
  )
  assert.equal(completed.status, 'completed')

  // Verify the output is preserved exactly
  const steps = await client.beta.threads.runs.steps.list(run.id, { thread_id: thread.id })
  const toolStep = steps.data.find(s => s.type === 'tool_calls')
  const output = (toolStep!.step_details as any).tool_calls[0].function.output
  assert.equal(output, specialOutput, 'Special characters in tool output should be preserved exactly')

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}

export const modelsList: Contract = async (client) => {
  const list = await client.models.list()

  const models = []
  for await (const model of list) {
    models.push(model)
  }

  assert.ok(models.length >= 1, `Should have at least 1 model, got ${models.length}`)

  for (const model of models) {
    assert.equal(typeof model.id, 'string', 'Model should have string id')
    assert.equal(typeof model.object, 'string', 'Model should have string object field')
  }
}

export const runStepRetrieve: Contract = async (client) => {
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

  // Create a run that triggers a tool call
  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
    tools: [fixtures.weatherTool],
  })
  assert.equal(run.status, 'requires_action')

  // Submit tool output to complete the run
  const tc = run.required_action!.submit_tool_outputs.tool_calls[0]
  const completed = await client.beta.threads.runs.submitToolOutputsAndPoll(
    run.id,
    {
      thread_id: thread.id,
      tool_outputs: [{ tool_call_id: tc.id, output: fixtures.weatherToolOutput }],
    },
  )
  assert.equal(completed.status, 'completed')

  // List steps and find one to retrieve individually
  const steps = await client.beta.threads.runs.steps.list(run.id, { thread_id: thread.id })
  assert.ok(steps.data.length >= 1, 'Should have at least 1 step')

  const stepFromList = steps.data[0]
  assertRunStepShape(stepFromList, 'step from list')

  // Retrieve the same step individually by id
  const retrieved = await client.beta.threads.runs.steps.retrieve(stepFromList.id, {
    thread_id: thread.id,
    run_id: run.id,
  })

  assertRunStepShape(retrieved, 'retrieved step')
  assert.equal(retrieved.id, stepFromList.id, 'Retrieved step id should match')
  assert.equal(retrieved.type, stepFromList.type, 'Retrieved step type should match')
  assert.equal(retrieved.status, stepFromList.status, 'Retrieved step status should match')
  assert.equal(retrieved.run_id, run.id, 'Retrieved step run_id should match')
  assert.equal(retrieved.thread_id, thread.id, 'Retrieved step thread_id should match')

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}

export const runUpdate: Contract = async (client) => {
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

  const updated = await client.beta.threads.runs.update(run.id, {
    thread_id: thread.id,
    metadata: { updated: 'true' },
  })

  assertRunShape(updated, 'updated run')
  assert.equal(updated.id, run.id)
  assert.equal(updated.thread_id, thread.id)
  assert.deepEqual(updated.metadata, { updated: 'true' })

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}
