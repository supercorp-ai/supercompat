import assert from 'node:assert/strict'

// --- Response shape ---

export function assertResponseShape(obj: any, message?: string) {
  const prefix = message ? `${message}: ` : ''
  assert.equal(typeof obj.id, 'string', `${prefix}id should be string`)
  assert.equal(obj.object, 'response', `${prefix}object should be 'response'`)
  assert.equal(typeof obj.created_at, 'number', `${prefix}created_at should be number`)
  assert.ok(['completed', 'failed', 'in_progress', 'cancelled', 'queued', 'incomplete'].includes(obj.status),
    `${prefix}status should be valid, got ${obj.status}`)
  assert.equal(typeof obj.model, 'string', `${prefix}model should be string`)
  assert.ok(Array.isArray(obj.output), `${prefix}output should be array`)
}

// --- Output item shapes ---

export function assertMessageOutputItem(obj: any, message?: string) {
  const prefix = message ? `${message}: ` : ''
  assert.equal(obj.type, 'message', `${prefix}type should be 'message'`)
  assert.equal(typeof obj.id, 'string', `${prefix}id should be string`)
  assert.equal(obj.role, 'assistant', `${prefix}role should be 'assistant'`)
  assert.ok(Array.isArray(obj.content), `${prefix}content should be array`)
  assert.ok(obj.content.length > 0, `${prefix}content should not be empty`)
  assert.equal(obj.content[0].type, 'output_text', `${prefix}content[0].type should be 'output_text'`)
  assert.equal(typeof obj.content[0].text, 'string', `${prefix}content[0].text should be string`)
}

export function assertFunctionCallOutputItem(obj: any, message?: string) {
  const prefix = message ? `${message}: ` : ''
  assert.equal(obj.type, 'function_call', `${prefix}type should be 'function_call'`)
  assert.equal(typeof obj.id, 'string', `${prefix}id should be string`)
  assert.equal(typeof obj.call_id, 'string', `${prefix}call_id should be string`)
  assert.equal(typeof obj.name, 'string', `${prefix}name should be string`)
  assert.equal(typeof obj.arguments, 'string', `${prefix}arguments should be string`)
}

// --- Conversation shape ---

export function assertConversationShape(obj: any, message?: string) {
  const prefix = message ? `${message}: ` : ''
  assert.equal(typeof obj.id, 'string', `${prefix}id should be string`)
  assert.equal(typeof obj.created_at, 'number', `${prefix}created_at should be number`)
}

// --- Stream events ---

export function assertStreamEvent(event: any, message?: string) {
  const prefix = message ? `${message}: ` : ''
  assert.equal(typeof event.type, 'string', `${prefix}event.type should be string`)
}

export function assertStreamEventOrder(events: Array<{ type: string }>, expectedOrder: string[]) {
  const indices = expectedOrder.map(name => {
    const idx = events.findIndex(e => e.type === name)
    assert.ok(idx >= 0, `Expected event '${name}' not found. Got: [${[...new Set(events.map(e => e.type))]}]`)
    return { name, idx }
  })

  for (let i = 1; i < indices.length; i++) {
    assert.ok(
      indices[i].idx > indices[i - 1].idx,
      `Event '${indices[i].name}' (index ${indices[i].idx}) should come after '${indices[i - 1].name}' (index ${indices[i - 1].idx})`,
    )
  }
}

export async function collectResponseStreamEvents(stream: AsyncIterable<any>): Promise<Array<any>> {
  const events: Array<any> = []
  for await (const event of stream) {
    events.push(event)
  }
  return events
}
