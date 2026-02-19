import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { normalizeComputerToolCallPayload } from '../src/adapters/client/anthropicClientAdapter/normalizeComputerToolCallPayload'
import { normalizeGeminiAction } from '../src/adapters/client/googleClientAdapter/normalizeGeminiAction'
import { post } from '../src/adapters/client/googleClientAdapter/completions/post'
import { serializeMessages } from '../src/adapters/client/googleClientAdapter/completions/post'

test('normalizeComputerToolCallPayload converts screenshot action', () => {
  const result = normalizeComputerToolCallPayload({
    action: 'screenshot',
  })

  assert.deepEqual(result, {
    action: { type: 'screenshot' },
    pending_safety_checks: [],
  })
})

test('normalizeComputerToolCallPayload converts left click with coordinates', () => {
  const result = normalizeComputerToolCallPayload({
    action: 'left_click',
    coordinate: [500, 300],
  })

  assert.equal(result.action.type, 'click')
  assert.equal(result.action.button, 'left')
  assert.equal(result.action.x, 500)
  assert.equal(result.action.y, 300)
  assert.equal(result.pending_safety_checks.length, 0)
})

test('normalizeComputerToolCallPayload converts scroll action', () => {
  const result = normalizeComputerToolCallPayload({
    action: 'scroll',
    coordinate: [400, 250],
    scroll_direction: 'down',
    scroll_amount: 3,
  })

  assert.equal(result.action.type, 'scroll')
  assert.equal(result.action.x, 400)
  assert.equal(result.action.y, 250)
  assert.equal(result.action.scroll_x, 0)
  assert.equal(result.action.direction, 'down')
  assert.equal(result.action.scroll_y, 3)
})

test('normalizeComputerToolCallPayload preserves action objects', () => {
  const payload = {
    action: {
      type: 'click',
      button: 'left',
      x: 10,
      y: 20,
    },
    pending_safety_checks: ['check-1'],
  }

  const result = normalizeComputerToolCallPayload(payload)

  assert.deepEqual(result, payload)
})

test('normalizeComputerToolCallPayload converts key presses', () => {
  const result = normalizeComputerToolCallPayload({
    action: 'key',
    text: 'ctrl+shift+T',
  })

  assert.equal(result.action.type, 'keypress')
  assert.deepEqual(result.action.keys, ['ctrl', 'shift', 't'])
})

test('normalizeComputerToolCallPayload converts typing', () => {
  const result = normalizeComputerToolCallPayload({
    action: 'type',
    text: 'Hello',
  })

  assert.equal(result.action.type, 'type')
  assert.equal(result.action.text, 'Hello')
})

test('normalizeComputerToolCallPayload converts drag path', () => {
  const result = normalizeComputerToolCallPayload({
    action: 'left_click_drag',
    coordinate_start: [0, 0],
    coordinate_end: [100, 200],
  })

  assert.equal(result.action.type, 'drag')
  assert.equal(result.action.path.length, 2)
  assert.deepEqual(result.action.path[0], { x: 0, y: 0 })
  assert.deepEqual(result.action.path[1], { x: 100, y: 200 })
})

test('normalizeComputerToolCallPayload converts wait with duration', () => {
  const result = normalizeComputerToolCallPayload({
    action: 'wait',
    duration: 1.5,
  })

  assert.equal(result.action.type, 'wait')
  assert.equal(result.action.duration_ms, 1500)
})

test('normalizeComputerToolCallPayload parses stringified payloads', () => {
  const payload = JSON.stringify({
    action: 'key',
    text: 'ctrl+shift+t',
    pending_safety_checks: ['foo'],
  })

  const result = normalizeComputerToolCallPayload(payload)

  assert.equal(result.action.type, 'keypress')
  assert.deepEqual(result.action.keys, ['ctrl', 'shift', 't'])
  assert.deepEqual(result.pending_safety_checks, ['foo'])
})

// ---------------------------------------------------------------------------
// normalizeGeminiAction tests (returns arrays of actions)
// ---------------------------------------------------------------------------

test('normalizeGeminiAction converts click_at to single action', () => {
  const result = normalizeGeminiAction('click_at', { x: 500, y: 300 })
  assert.equal(result.length, 1)
  assert.deepEqual(result[0], {
    action: { type: 'click', button: 'left', x: 500, y: 300 },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction converts single_click_at', () => {
  const [first] = normalizeGeminiAction('single_click_at', { x: 100, y: 200 })
  assert.equal(first.action.type, 'click')
  assert.equal(first.action.button, 'left')
  assert.equal(first.action.x, 100)
  assert.equal(first.action.y, 200)
})

test('normalizeGeminiAction converts right_click_at', () => {
  const [first] = normalizeGeminiAction('right_click_at', { x: 50, y: 60 })
  assert.deepEqual(first, {
    action: { type: 'click', button: 'right', x: 50, y: 60 },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction converts double_click_at', () => {
  const [first] = normalizeGeminiAction('double_click_at', { x: 10, y: 20 })
  assert.deepEqual(first, {
    action: { type: 'double_click', x: 10, y: 20 },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction converts triple_click_at', () => {
  const [first] = normalizeGeminiAction('triple_click_at', { x: 10, y: 20 })
  assert.deepEqual(first, {
    action: { type: 'double_click', x: 10, y: 20, repetitions: 3 },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction converts hover_at', () => {
  const [first] = normalizeGeminiAction('hover_at', { x: 300, y: 400 })
  assert.deepEqual(first, {
    action: { type: 'move', x: 300, y: 400 },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction converts type_text_at with defaults (clear + enter)', () => {
  const result = normalizeGeminiAction('type_text_at', { x: 100, y: 200, text: 'hello' })
  assert.equal(result.length, 5)
  assert.deepEqual(result[0].action, { type: 'click', button: 'left', x: 100, y: 200 })
  assert.deepEqual(result[1].action, { type: 'keypress', keys: ['ctrl', 'a'] })
  assert.deepEqual(result[2].action, { type: 'keypress', keys: ['Backspace'] })
  assert.deepEqual(result[3].action, { type: 'type', text: 'hello' })
  assert.deepEqual(result[4].action, { type: 'keypress', keys: ['Return'] })
})

test('normalizeGeminiAction converts type_text_at with press_enter false', () => {
  const result = normalizeGeminiAction('type_text_at', {
    x: 100, y: 200, text: 'hello', press_enter: false,
  })
  assert.equal(result.length, 4)
  assert.deepEqual(result[0].action, { type: 'click', button: 'left', x: 100, y: 200 })
  assert.deepEqual(result[1].action, { type: 'keypress', keys: ['ctrl', 'a'] })
  assert.deepEqual(result[2].action, { type: 'keypress', keys: ['Backspace'] })
  assert.deepEqual(result[3].action, { type: 'type', text: 'hello' })
})

test('normalizeGeminiAction converts type_text_at with clear_before_typing false', () => {
  const result = normalizeGeminiAction('type_text_at', {
    x: 100, y: 200, text: 'hello', clear_before_typing: false,
  })
  assert.equal(result.length, 3)
  assert.deepEqual(result[0].action, { type: 'click', button: 'left', x: 100, y: 200 })
  assert.deepEqual(result[1].action, { type: 'type', text: 'hello' })
  assert.deepEqual(result[2].action, { type: 'keypress', keys: ['Return'] })
})

test('normalizeGeminiAction converts type_text_at with both disabled', () => {
  const result = normalizeGeminiAction('type_text_at', {
    x: 100, y: 200, text: 'hello', clear_before_typing: false, press_enter: false,
  })
  assert.equal(result.length, 2)
  assert.deepEqual(result[0].action, { type: 'click', button: 'left', x: 100, y: 200 })
  assert.deepEqual(result[1].action, { type: 'type', text: 'hello' })
})

test('normalizeGeminiAction converts key_combination with array', () => {
  const [first] = normalizeGeminiAction('key_combination', { keys: ['Control', 'Shift', 'T'] })
  assert.deepEqual(first, {
    action: { type: 'keypress', keys: ['ctrl', 'shift', 't'] },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction converts key_combination with string', () => {
  const [first] = normalizeGeminiAction('key_combination', { keys: 'Control+c' })
  assert.deepEqual(first.action, { type: 'keypress', keys: ['ctrl', 'c'] })
})

test('normalizeGeminiAction converts scroll_at', () => {
  const [first] = normalizeGeminiAction('scroll_at', { x: 400, y: 300, direction: 'down', amount: 5 })
  assert.deepEqual(first, {
    action: { type: 'scroll', x: 400, y: 300, scroll_x: 0, scroll_y: 5 },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction converts scroll_document', () => {
  const [first] = normalizeGeminiAction('scroll_document', { direction: 'up', amount: 3 })
  assert.deepEqual(first, {
    action: { type: 'scroll', x: 640, y: 360, scroll_x: 0, scroll_y: -3 },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction converts drag_and_drop', () => {
  const [first] = normalizeGeminiAction('drag_and_drop', {
    x: 100, y: 200, destination_x: 300, destination_y: 400,
  })
  assert.deepEqual(first, {
    action: { type: 'drag', path: [{ x: 100, y: 200 }, { x: 300, y: 400 }] },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction converts wait_5_seconds', () => {
  const [first] = normalizeGeminiAction('wait_5_seconds', {})
  assert.deepEqual(first, {
    action: { type: 'wait' },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction converts wait_for_load', () => {
  const [first] = normalizeGeminiAction('wait_for_load', {})
  assert.deepEqual(first, {
    action: { type: 'wait' },
    pending_safety_checks: [],
  })
})

// navigate, go_back, go_forward, open_web_browser, search are excluded
// via excludedPredefinedFunctions — no tests needed for those

test('normalizeGeminiAction reads coordinate_x/coordinate_y', () => {
  const [first] = normalizeGeminiAction('click_at', { coordinate_x: 700, coordinate_y: 500 })
  assert.equal(first.action.x, 700)
  assert.equal(first.action.y, 500)
})

// ---------------------------------------------------------------------------
// Sequential compound action execution via post handler
// ---------------------------------------------------------------------------

/**
 * Helper: create a mock Google GenAI that returns a single type_text_at function call.
 */
const createMockGoogle = (functionCall: any) => ({
  models: {
    generateContentStream: async function* () {
      yield {
        candidates: [{
          content: {
            parts: [{ functionCall }],
          },
          finishReason: 'STOP',
        }],
      }
    },
    generateContent: async () => ({
      candidates: [{
        content: {
          parts: [{ functionCall }],
        },
        finishReason: 'STOP',
      }],
    }),
  },
} as any)

/** Parse SSE tool call deltas from a streaming response */
async function collectToolCalls(response: Response) {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    text += typeof value === 'string' ? value : decoder.decode(value, { stream: true })
  }
  const toolCalls: any[] = []
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue
    const data = JSON.parse(line.slice(6))
    const delta = data.choices?.[0]?.delta
    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        toolCalls.push(tc)
      }
    }
  }
  return toolCalls
}

test('post handler emits only first sub-action for compound type_text_at', async () => {
  const mockGoogle = createMockGoogle({
    name: 'type_text_at',
    args: { x: 500, y: 300, text: 'hello', press_enter: false, clear_before_typing: false },
  })

  const handler = post({ google: mockGoogle })
  const body = {
    model: 'gemini-3-flash-preview',
    messages: [{ role: 'user', content: 'Type hello' }],
    tools: [{ type: 'computer_use_preview', computer_use_preview: { display_width: 1280, display_height: 720 } }],
    stream: true,
  }

  // First call: should emit only the click (first sub-action)
  const res1 = await handler('http://localhost/v1/chat/completions', {
    body: JSON.stringify(body),
  })
  const tc1 = await collectToolCalls(res1)
  assert.equal(tc1.length, 1, 'Should emit exactly 1 tool call (click)')
  const args1 = JSON.parse(tc1[0].function.arguments)
  assert.equal(args1.action.type, 'click', 'First sub-action should be click')

  // Second call: should return synthetic response with type (second sub-action)
  const res2 = await handler('http://localhost/v1/chat/completions', {
    body: JSON.stringify(body),
  })
  const tc2 = await collectToolCalls(res2)
  assert.equal(tc2.length, 1, 'Should emit exactly 1 tool call (type)')
  const args2 = JSON.parse(tc2[0].function.arguments)
  assert.equal(args2.action.type, 'type', 'Second sub-action should be type')
  assert.equal(args2.action.text, 'hello')
})

test('post handler drains all sub-actions before calling model again', async () => {
  let apiCallCount = 0
  const mockGoogle = {
    models: {
      generateContentStream: async function* () {
        apiCallCount++
        yield {
          candidates: [{
            content: {
              parts: [{ functionCall: { name: 'click_at', args: { x: 100, y: 200 } } }],
            },
            finishReason: 'STOP',
          }],
        }
      },
    },
  } as any

  const handler = post({ google: mockGoogle })
  const body = {
    model: 'gemini-3-flash-preview',
    messages: [{ role: 'user', content: 'Type hello' }],
    tools: [{ type: 'computer_use_preview', computer_use_preview: { display_width: 1280, display_height: 720 } }],
    stream: true,
  }

  // First call: real API call, returns click_at (single action)
  await handler('http://localhost/v1/chat/completions', { body: JSON.stringify(body) })
  assert.equal(apiCallCount, 1, 'Should have made 1 API call')

  // Second call: no pending actions, makes another real API call
  await handler('http://localhost/v1/chat/completions', { body: JSON.stringify(body) })
  assert.equal(apiCallCount, 2, 'Should have made 2 API calls (no pending actions)')
})

test('post handler: compound type_text_at with defaults produces 5 sequential calls', async () => {
  let apiCallCount = 0
  const mockGoogle = createMockGoogle({
    name: 'type_text_at',
    args: { x: 500, y: 300, text: 'test' },
  })
  // Wrap to count calls
  const origStream = mockGoogle.models.generateContentStream
  mockGoogle.models.generateContentStream = async function* (...a: any[]) {
    apiCallCount++
    yield* origStream.apply(this, a)
  }

  const handler = post({ google: mockGoogle })
  const body = {
    model: 'gemini-3-flash-preview',
    messages: [{ role: 'user', content: 'Type test' }],
    tools: [{ type: 'computer_use_preview', computer_use_preview: { display_width: 1280, display_height: 720 } }],
    stream: true,
  }

  // Call 1: real API call → click (first sub-action of 5)
  const res1 = await handler('http://localhost/v1/chat/completions', { body: JSON.stringify(body) })
  const tc1 = await collectToolCalls(res1)
  assert.equal(apiCallCount, 1)
  assert.equal(JSON.parse(tc1[0].function.arguments).action.type, 'click')

  // Calls 2-5: synthetic responses for remaining sub-actions
  const expectedTypes = ['keypress', 'keypress', 'type', 'keypress'] // ctrl+a, backspace, type, enter
  for (let i = 0; i < 4; i++) {
    const res = await handler('http://localhost/v1/chat/completions', { body: JSON.stringify(body) })
    const tc = await collectToolCalls(res)
    assert.equal(apiCallCount, 1, `Should NOT call API for sub-action ${i + 2}`)
    assert.equal(JSON.parse(tc[0].function.arguments).action.type, expectedTypes[i])
  }

  // Call 6: all sub-actions consumed, should make a real API call
  await handler('http://localhost/v1/chat/completions', { body: JSON.stringify(body) })
  assert.equal(apiCallCount, 2, 'Should make real API call after all sub-actions consumed')
})

// ---------------------------------------------------------------------------
// serializeMessages round-trip: compound sub-actions collapse to single functionCall
// ---------------------------------------------------------------------------

test('serializeMessages collapses compound sub-actions into single functionCall', () => {
  const geminiCallId = 'gcall_test123'
  const messages = [
    { role: 'user', content: 'Type hello' },
    // Assistant with 2 sub-action tool calls (type_text_at with both disabled = click + type)
    {
      role: 'assistant',
      tool_calls: [
        {
          id: 'tc_0',
          type: 'function',
          function: {
            name: 'computer_call',
            arguments: JSON.stringify({
              action: { type: 'click', button: 'left', x: 640, y: 360 },
              pending_safety_checks: [],
              _geminiCallId: geminiCallId,
              _geminiAction: 'type_text_at',
              _subActionIndex: 0,
              _subActionTotal: 2,
              _geminiArgs: { x: 640, y: 360, text: 'hello' },
            }),
          },
        },
      ],
    },
    { role: 'tool', tool_call_id: 'tc_0', content: 'screenshot from click' },
    {
      role: 'assistant',
      tool_calls: [
        {
          id: 'tc_1',
          type: 'function',
          function: {
            name: 'computer_call',
            arguments: JSON.stringify({
              action: { type: 'type', text: 'hello' },
              pending_safety_checks: [],
              _geminiCallId: geminiCallId,
              _geminiAction: 'type_text_at',
              _subActionIndex: 1,
              _subActionTotal: 2,
            }),
          },
        },
      ],
    },
    { role: 'tool', tool_call_id: 'tc_1', content: 'screenshot from type' },
  ]

  const { contents } = serializeMessages(messages)

  // Should have: user, model (one functionCall), user (one functionResponse)
  assert.equal(contents.length, 3)
  assert.equal(contents[0].role, 'user')
  assert.equal(contents[1].role, 'model')
  assert.equal(contents[2].role, 'user')

  // Model part: single functionCall with original Gemini name and args
  const modelParts = contents[1].parts!
  assert.equal(modelParts.length, 1)
  const fc = modelParts[0].functionCall!
  assert.equal(fc.name, 'type_text_at')
  assert.deepEqual(fc.args, { x: 640, y: 360, text: 'hello' })

  // User part: single functionResponse with the last sub-action's result
  const userParts = contents[2].parts!
  assert.equal(userParts.length, 1)
  const fr = userParts[0].functionResponse!
  assert.equal(fr.name, 'type_text_at')
  assert.deepEqual(fr.response, { output: 'screenshot from type' })
})
