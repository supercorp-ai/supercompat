import assert from 'node:assert/strict'

// --- Object shape validators ---

export function assertAssistantShape(obj: any, message?: string) {
  const prefix = message ? `${message}: ` : ''
  assert.equal(typeof obj.id, 'string', `${prefix}id should be string`)
  assert.equal(obj.object, 'assistant', `${prefix}object should be 'assistant'`)
  assert.equal(typeof obj.created_at, 'number', `${prefix}created_at should be number`)
  assert.equal(typeof obj.model, 'string', `${prefix}model should be string`)
  assert.ok(obj.name === null || typeof obj.name === 'string', `${prefix}name should be string|null`)
  assert.ok(obj.description === null || typeof obj.description === 'string', `${prefix}description should be string|null`)
  assert.ok(obj.instructions === null || typeof obj.instructions === 'string', `${prefix}instructions should be string|null`)
  assert.ok(Array.isArray(obj.tools), `${prefix}tools should be array`)
  assert.ok(obj.metadata === null || typeof obj.metadata === 'object', `${prefix}metadata should be object|null`)
}

export function assertThreadShape(obj: any, message?: string) {
  const prefix = message ? `${message}: ` : ''
  assert.equal(typeof obj.id, 'string', `${prefix}id should be string`)
  assert.equal(obj.object, 'thread', `${prefix}object should be 'thread'`)
  assert.equal(typeof obj.created_at, 'number', `${prefix}created_at should be number`)
  assert.ok(obj.metadata === null || typeof obj.metadata === 'object', `${prefix}metadata should be object|null`)
}

export function assertMessageShape(obj: any, message?: string) {
  const prefix = message ? `${message}: ` : ''
  assert.equal(typeof obj.id, 'string', `${prefix}id should be string`)
  assert.equal(obj.object, 'thread.message', `${prefix}object should be 'thread.message'`)
  assert.equal(typeof obj.created_at, 'number', `${prefix}created_at should be number`)
  assert.ok(['user', 'assistant'].includes(obj.role), `${prefix}role should be user|assistant, got ${obj.role}`)
  assert.ok(Array.isArray(obj.content), `${prefix}content should be array`)
  // status may be undefined on user-created messages (only set by runs)
  if (obj.status !== undefined) {
    assert.ok(['in_progress', 'incomplete', 'completed'].includes(obj.status), `${prefix}status should be valid, got ${obj.status}`)
  }
  assert.equal(typeof obj.thread_id, 'string', `${prefix}thread_id should be string`)
  assert.ok(obj.run_id === null || typeof obj.run_id === 'string', `${prefix}run_id should be string|null`)
  assert.ok(obj.assistant_id === null || typeof obj.assistant_id === 'string', `${prefix}assistant_id should be string|null`)
  assert.ok(obj.attachments === null || obj.attachments === undefined || Array.isArray(obj.attachments), `${prefix}attachments should be array|null|undefined`)
  assert.ok(obj.metadata === null || typeof obj.metadata === 'object', `${prefix}metadata should be object|null`)
  // These fields may be undefined on user-created messages
  if (obj.completed_at !== undefined) {
    assert.ok(obj.completed_at === null || typeof obj.completed_at === 'number', `${prefix}completed_at should be number|null`)
  }
  if (obj.incomplete_at !== undefined) {
    assert.ok(obj.incomplete_at === null || typeof obj.incomplete_at === 'number', `${prefix}incomplete_at should be number|null`)
  }
  if (obj.incomplete_details !== undefined) {
    assert.ok(obj.incomplete_details === null || typeof obj.incomplete_details === 'object', `${prefix}incomplete_details should be object|null`)
  }
}

export function assertMessageContentShape(content: any, message?: string) {
  const prefix = message ? `${message}: ` : ''
  assert.ok(['text', 'image_file', 'image_url', 'refusal'].includes(content.type),
    `${prefix}content.type should be text|image_file|image_url|refusal, got ${content.type}`)

  if (content.type === 'text') {
    assert.ok(content.text, `${prefix}text content should have text`)
    assert.equal(typeof content.text.value, 'string', `${prefix}text.value should be string`)
    assert.ok(Array.isArray(content.text.annotations), `${prefix}text.annotations should be array`)
  }
}

export function assertRunShape(obj: any, message?: string) {
  const prefix = message ? `${message}: ` : ''
  assert.equal(typeof obj.id, 'string', `${prefix}id should be string`)
  assert.equal(obj.object, 'thread.run', `${prefix}object should be 'thread.run'`)
  assert.equal(typeof obj.created_at, 'number', `${prefix}created_at should be number`)
  assert.equal(typeof obj.thread_id, 'string', `${prefix}thread_id should be string`)
  assert.equal(typeof obj.assistant_id, 'string', `${prefix}assistant_id should be string`)
  assert.equal(typeof obj.status, 'string', `${prefix}status should be string`)
  assert.ok(typeof obj.model === 'string', `${prefix}model should be string`)
  assert.ok(Array.isArray(obj.tools), `${prefix}tools should be array`)
  assert.ok(obj.metadata === null || typeof obj.metadata === 'object', `${prefix}metadata should be object|null`)
  assert.ok(obj.required_action === null || typeof obj.required_action === 'object', `${prefix}required_action should be object|null`)
  assert.ok(obj.last_error === null || typeof obj.last_error === 'object', `${prefix}last_error should be object|null`)
  assert.ok(obj.usage === null || typeof obj.usage === 'object', `${prefix}usage should be object|null`)
  assert.ok(obj.started_at === null || typeof obj.started_at === 'number', `${prefix}started_at should be number|null`)
  assert.ok(obj.completed_at === null || typeof obj.completed_at === 'number', `${prefix}completed_at should be number|null`)
  assert.ok(obj.cancelled_at === null || typeof obj.cancelled_at === 'number', `${prefix}cancelled_at should be number|null`)
  assert.ok(obj.failed_at === null || typeof obj.failed_at === 'number', `${prefix}failed_at should be number|null`)
  assert.ok(obj.expires_at === null || typeof obj.expires_at === 'number', `${prefix}expires_at should be number|null`)
}

export function assertRequiredActionShape(action: any, message?: string) {
  const prefix = message ? `${message}: ` : ''
  assert.equal(action.type, 'submit_tool_outputs', `${prefix}type should be submit_tool_outputs`)
  assert.ok(action.submit_tool_outputs, `${prefix}should have submit_tool_outputs`)
  assert.ok(Array.isArray(action.submit_tool_outputs.tool_calls), `${prefix}tool_calls should be array`)

  for (const tc of action.submit_tool_outputs.tool_calls) {
    assertFunctionToolCallShape(tc, `${prefix}tool_call`)
  }
}

export function assertFunctionToolCallShape(tc: any, message?: string) {
  const prefix = message ? `${message}: ` : ''
  assert.equal(typeof tc.id, 'string', `${prefix}id should be string`)
  assert.equal(tc.type, 'function', `${prefix}type should be 'function'`)
  assert.ok(tc.function, `${prefix}should have function`)
  assert.equal(typeof tc.function.name, 'string', `${prefix}function.name should be string`)
  assert.equal(typeof tc.function.arguments, 'string', `${prefix}function.arguments should be string`)
}

export function assertRunStepShape(obj: any, message?: string) {
  const prefix = message ? `${message}: ` : ''
  assert.equal(typeof obj.id, 'string', `${prefix}id should be string`)
  assert.equal(obj.object, 'thread.run.step', `${prefix}object should be 'thread.run.step'`)
  assert.equal(typeof obj.created_at, 'number', `${prefix}created_at should be number`)
  assert.equal(typeof obj.assistant_id, 'string', `${prefix}assistant_id should be string`)
  assert.equal(typeof obj.thread_id, 'string', `${prefix}thread_id should be string`)
  assert.equal(typeof obj.run_id, 'string', `${prefix}run_id should be string`)
  assert.ok(['message_creation', 'tool_calls'].includes(obj.type), `${prefix}type should be message_creation|tool_calls, got ${obj.type}`)
  assert.ok(['in_progress', 'cancelled', 'failed', 'completed', 'expired'].includes(obj.status), `${prefix}status should be valid, got ${obj.status}`)
  assert.ok(obj.step_details, `${prefix}should have step_details`)
  if (obj.usage !== undefined) {
    assert.ok(obj.usage === null || typeof obj.usage === 'object', `${prefix}usage should be object|null`)
  }
  if (obj.last_error !== undefined) {
    assert.ok(obj.last_error === null || typeof obj.last_error === 'object', `${prefix}last_error should be object|null`)
  }
  if (obj.metadata !== undefined) {
    assert.ok(obj.metadata === null || typeof obj.metadata === 'object', `${prefix}metadata should be object|null`)
  }
}

export function assertPaginatedList(list: any, message?: string) {
  const prefix = message ? `${message}: ` : ''
  assert.ok(Array.isArray(list.data), `${prefix}data should be array`)
  assert.equal(typeof list.has_more, 'boolean', `${prefix}has_more should be boolean`)
}

export function assertStreamEvent(event: any, message?: string) {
  const prefix = message ? `${message}: ` : ''
  assert.equal(typeof event.event, 'string', `${prefix}event.event should be string, got ${typeof event.event} (${event.event})`)
  assert.ok(event.data !== undefined, `${prefix}event should have data`)
}

// --- Event ordering ---

export function assertEventOrder(events: Array<{ event: string }>, expectedOrder: string[]) {
  const indices = expectedOrder.map(name => {
    const idx = events.findIndex(e => e.event === name)
    assert.ok(idx >= 0, `Expected event '${name}' not found. Got: [${[...new Set(events.map(e => e.event))]}]`)
    return { name, idx }
  })

  for (let i = 1; i < indices.length; i++) {
    assert.ok(
      indices[i].idx > indices[i - 1].idx,
      `Event '${indices[i].name}' (index ${indices[i].idx}) should come after '${indices[i - 1].name}' (index ${indices[i - 1].idx})`,
    )
  }
}

// --- Helpers ---

export async function collectStreamEvents(stream: AsyncIterable<any>): Promise<Array<{ event: string; data: any }>> {
  const events: Array<{ event: string; data: any }> = []
  for await (const event of stream) {
    events.push({ event: event.event, data: event.data })
  }
  return events
}
