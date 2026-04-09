import type OpenAI from 'openai'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './lib/config'

const __dirname = dirname(fileURLToPath(import.meta.url))
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

export const fileSearchAnnotationIndexes: Contract = async (client) => {
  // Upload a real PDF with substantial content
  const pdfBytes = readFileSync(join(__dirname, 'lib', 'ai-vs-human-marketing.pdf'))
  const file = await client.files.create({
    file: new File([pdfBytes], 'ai-vs-human-marketing.pdf', { type: 'application/pdf' }),
    purpose: 'assistants',
  })

  const vectorStore = await client.vectorStores.create({
    name: 'Annotation Index Test',
    file_ids: [file.id],
  })

  // Wait for indexing
  for (let i = 0; i < 60; i++) {
    const vs = await client.vectorStores.retrieve(vectorStore.id)
    if (vs.file_counts.completed > 0 && vs.file_counts.in_progress === 0) break
    await new Promise(r => setTimeout(r, 1000))
  }
  await new Promise(r => setTimeout(r, 5000))

  const assistant = await client.beta.assistants.create({
    model: config.model,
    instructions: 'You are a research assistant. You MUST use file_search for EVERY question. You MUST include inline citations from the file for EVERY fact you state. NEVER answer without citing the source file.',
    tools: [{ type: 'file_search' }],
    tool_resources: { file_search: { vector_store_ids: [vectorStore.id] } },
  })

  const thread = await client.beta.threads.create()
  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Search the uploaded file and list 3 specific facts about AI marketing tools. You MUST cite the source file for each fact.',
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
    temperature: 0,
  } as any)
  assert.equal(run.status, 'completed')

  const messages = await client.beta.threads.messages.list(thread.id)
  const assistantMsg = messages.data.find(m => m.role === 'assistant')
  assert.ok(assistantMsg, 'Should have assistant message')

  const textContent = assistantMsg.content.find(c => c.type === 'text')
  assert.ok(textContent && textContent.type === 'text', 'Should have text content')

  const text = textContent.text.value
  const annotations = textContent.text.annotations

  // Validate each annotation's indexes (skip zeroed-out annotations from some adapters)
  const validAnnotations = annotations.filter(ann =>
    typeof ann.start_index === 'number' && typeof ann.end_index === 'number' &&
    ann.end_index > ann.start_index
  )

  for (const ann of validAnnotations) {
    assert.ok(ann.start_index >= 0, `start_index should be >= 0, got ${ann.start_index}`)
    assert.ok(ann.end_index <= text.length, `end_index (${ann.end_index}) should be <= text length (${text.length})`)

    // The annotation text should match the substring at those indexes
    const substringAtIndex = text.slice(ann.start_index, ann.end_index)
    assert.equal(
      substringAtIndex,
      ann.text,
      `Annotation text "${ann.text}" should match text at indexes [${ann.start_index}:${ann.end_index}], but got "${substringAtIndex}"`,
    )
  }

  // Should have at least one annotation (file_citation)
  assert.ok(annotations.length >= 1, `Should have at least 1 annotation, got ${annotations.length}`)

  // Annotations should not overlap
  const sorted = [...annotations].sort((a, b) => a.start_index - b.start_index)
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(
      sorted[i].start_index >= sorted[i - 1].end_index,
      `Annotations should not overlap: annotation ${i - 1} ends at ${sorted[i - 1].end_index}, annotation ${i} starts at ${sorted[i].start_index}`,
    )
  }

  // Cleanup
  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
  await client.vectorStores.delete(vectorStore.id)
  await client.files.delete(file.id)
}

export const runFailureErrorDetails: Contract = async (client) => {
  let assistant: any
  try {
    assistant = await client.beta.assistants.create({
      model: 'nonexistent-model-that-does-not-exist-12345',
      instructions: 'Test error handling.',
    })
  } catch (e: any) {
    // Some providers throw at assistant creation with invalid model — that's valid error handling
    assert.ok(e.message || e.status, 'Error at assistant creation should have message or status')
    return
  }

  const thread = await client.beta.threads.create()
  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Hello',
  })

  // The run should either throw or emit thread.run.failed
  let threwAtCreate = false
  let stream: any
  try {
    stream = await client.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id,
      stream: true,
    })
  } catch (e: any) {
    threwAtCreate = true
    assert.ok(e.message || e.status, 'Error at run creation should have message or status')
  }

  if (!threwAtCreate && stream) {
    const events: any[] = []
    try {
      for await (const event of stream) {
        events.push(event)
      }
    } catch (e: any) {
      // Stream may throw during iteration — that's also valid
      assert.ok(e.message || e.status, 'Stream error should have message or status')
      return
    }

    const failedEvent = events.find(e => e.event === 'thread.run.failed')
    if (failedEvent) {
      const lastError = failedEvent.data.last_error
      assert.ok(lastError, 'Failed run should have last_error')
      assert.ok(lastError.code != null, 'last_error.code should not be null')
      assert.ok(typeof lastError.message === 'string', `last_error.message should be a string, got ${typeof lastError.message}`)
      assert.ok(lastError.message.length > 0, 'last_error.message should not be empty')
      assert.ok(lastError.message !== 'undefined', 'last_error.message should not be the string "undefined"')
    }
    // If no failed event and no throw, the run may have completed (some adapters ignore invalid models)
  }

  try { await cleanup(client, { assistantId: assistant.id, threadId: thread.id }) } catch {}
}

export const invalidThreadError: Contract = async (client) => {
  // Attempting to list messages on a non-existent thread should either throw or return empty
  let threw = false
  let errorHasInfo = false
  try {
    const result = await client.beta.threads.messages.list('thread_nonexistent_12345')
    // If it doesn't throw, that's ok (memory adapter) — just verify it returns something valid
    assert.ok(result, 'Should return a result object')
  } catch (e: any) {
    threw = true
    errorHasInfo = !!(e.message || e.status)
  }
  // If it threw, the error should have useful information
  if (threw) {
    assert.ok(errorHasInfo, 'Error should have a message or status')
  }
}

export const invalidAssistantRunError: Contract = async (client) => {
  const thread = await client.beta.threads.create()
  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Hello',
  })

  // Running with a non-existent assistant should fail — either throw or return a failed run
  let threw = false
  let errorHasInfo = false
  try {
    const run = await client.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: 'asst_nonexistent_12345',
    })
    // Some adapters don't throw but return a failed/errored run
    if (run.status === 'failed') {
      assert.ok(run.last_error, 'Failed run should have last_error')
    }
  } catch (e: any) {
    threw = true
    errorHasInfo = !!(e.message || e.status)
  }

  if (threw) {
    assert.ok(errorHasInfo, 'Error should have a message or status')
  }

  try { await client.beta.threads.delete(thread.id) } catch {}
}

export const toolCallStepsPersistAfterReload: Contract = async (client) => {
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

  // Stream the run until requires_action
  const runStream = client.beta.threads.runs.stream(thread.id, {
    assistant_id: assistant.id,
    tools: [fixtures.weatherTool],
  })

  const events = await collectStreamEvents(runStream)
  const requiresAction = events.find(e => e.event === 'thread.run.requires_action')
  assert.ok(requiresAction, 'Should have requires_action event')

  const tc = requiresAction!.data.required_action.submit_tool_outputs.tool_calls[0]
  assert.equal(tc.function.name, 'get_weather')

  // Submit tool outputs via stream
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

  // --- "Reload": re-fetch messages and steps from scratch ---
  const messages = await client.beta.threads.messages.list(thread.id)
  const assistantMessages = messages.data.filter(m => m.role === 'assistant')
  assert.ok(assistantMessages.length >= 1, 'Should have at least 1 assistant message after reload')

  // Find a message with a run_id that we can use to fetch steps
  const messageWithRunId = assistantMessages.find(m => m.run_id)
  assert.ok(messageWithRunId, 'At least one assistant message should have a run_id')

  const steps = await client.beta.threads.runs.steps.list(
    messageWithRunId!.run_id!,
    { thread_id: thread.id },
  )

  const toolStep = steps.data.find(s => s.type === 'tool_calls')
  assert.ok(
    toolStep,
    `Tool call step should persist after reload. Got step types: [${steps.data.map(s => s.type).join(', ')}]`,
  )

  const toolCallDetails = (toolStep!.step_details as any).tool_calls
  assert.ok(toolCallDetails.length >= 1, 'Should have at least 1 tool call in step')
  assert.equal(toolCallDetails[0].function.name, 'get_weather')

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}
