import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { normalizeComputerToolCallPayload } from '../src/adapters/client/anthropicClientAdapter/normalizeComputerToolCallPayload'
import { normalizeGeminiAction } from '../src/adapters/client/googleClientAdapter/normalizeGeminiAction'

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
// normalizeGeminiAction tests
// ---------------------------------------------------------------------------

test('normalizeGeminiAction converts click_at', () => {
  const result = normalizeGeminiAction('click_at', { x: 500, y: 300 })
  assert.deepEqual(result, {
    action: { type: 'click', button: 'left', x: 500, y: 300 },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction converts single_click_at', () => {
  const result = normalizeGeminiAction('single_click_at', { x: 100, y: 200 })
  assert.equal(result.action.type, 'click')
  assert.equal(result.action.button, 'left')
  assert.equal(result.action.x, 100)
  assert.equal(result.action.y, 200)
})

test('normalizeGeminiAction converts right_click_at', () => {
  const result = normalizeGeminiAction('right_click_at', { x: 50, y: 60 })
  assert.deepEqual(result, {
    action: { type: 'click', button: 'right', x: 50, y: 60 },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction converts double_click_at', () => {
  const result = normalizeGeminiAction('double_click_at', { x: 10, y: 20 })
  assert.deepEqual(result, {
    action: { type: 'double_click', x: 10, y: 20 },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction converts triple_click_at', () => {
  const result = normalizeGeminiAction('triple_click_at', { x: 10, y: 20 })
  assert.deepEqual(result, {
    action: { type: 'double_click', x: 10, y: 20, repetitions: 3 },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction converts hover_at', () => {
  const result = normalizeGeminiAction('hover_at', { x: 300, y: 400 })
  assert.deepEqual(result, {
    action: { type: 'move', x: 300, y: 400 },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction converts type_text_at without submit', () => {
  const result = normalizeGeminiAction('type_text_at', { x: 100, y: 200, text: 'hello' })
  assert.equal(result.action.type, 'click')
  assert.equal(result.action.button, 'left')
  assert.equal(result.action.x, 100)
  assert.equal(result.action.y, 200)
  assert.deepEqual(result.action.pending_actions, [
    { type: 'type', text: 'hello' },
  ])
})

test('normalizeGeminiAction converts type_text_at with submit', () => {
  const result = normalizeGeminiAction('type_text_at', {
    x: 100, y: 200, text: 'hello', submit_after_type: true,
  })
  assert.deepEqual(result.action.pending_actions, [
    { type: 'type', text: 'hello' },
    { type: 'keypress', keys: ['Return'] },
  ])
})

test('normalizeGeminiAction converts key_combination with array', () => {
  const result = normalizeGeminiAction('key_combination', { keys: ['Control', 'Shift', 'T'] })
  assert.deepEqual(result, {
    action: { type: 'keypress', keys: ['ctrl', 'shift', 't'] },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction converts key_combination with string', () => {
  const result = normalizeGeminiAction('key_combination', { keys: 'Control+c' })
  assert.deepEqual(result.action, { type: 'keypress', keys: ['ctrl', 'c'] })
})

test('normalizeGeminiAction converts scroll_at', () => {
  const result = normalizeGeminiAction('scroll_at', { x: 400, y: 300, direction: 'down', amount: 5 })
  assert.deepEqual(result, {
    action: { type: 'scroll', x: 400, y: 300, scroll_x: 0, scroll_y: 5 },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction converts scroll_document', () => {
  const result = normalizeGeminiAction('scroll_document', { direction: 'up', amount: 3 })
  assert.deepEqual(result, {
    action: { type: 'scroll', x: 640, y: 360, scroll_x: 0, scroll_y: -3 },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction converts drag_and_drop', () => {
  const result = normalizeGeminiAction('drag_and_drop', {
    x: 100, y: 200, destination_x: 300, destination_y: 400,
  })
  assert.deepEqual(result, {
    action: { type: 'drag', path: [{ x: 100, y: 200 }, { x: 300, y: 400 }] },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction converts wait_5_seconds', () => {
  const result = normalizeGeminiAction('wait_5_seconds', {})
  assert.deepEqual(result, {
    action: { type: 'wait' },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction converts wait_for_load', () => {
  const result = normalizeGeminiAction('wait_for_load', {})
  assert.deepEqual(result, {
    action: { type: 'wait' },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction converts navigate with pending_actions', () => {
  const result = normalizeGeminiAction('navigate', { url: 'https://example.com' })
  assert.equal(result.action.type, 'keypress')
  assert.deepEqual(result.action.keys, ['ctrl', 'l'])
  assert.deepEqual(result.action.pending_actions, [
    { type: 'wait' },
    { type: 'type', text: 'https://example.com' },
    { type: 'keypress', keys: ['Return'] },
    { type: 'wait' },
  ])
})

test('normalizeGeminiAction converts go_back', () => {
  const result = normalizeGeminiAction('go_back', {})
  assert.deepEqual(result, {
    action: { type: 'keypress', keys: ['alt', 'left'] },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction converts go_forward', () => {
  const result = normalizeGeminiAction('go_forward', {})
  assert.deepEqual(result, {
    action: { type: 'keypress', keys: ['alt', 'right'] },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction converts open_web_browser', () => {
  const result = normalizeGeminiAction('open_web_browser', {})
  assert.deepEqual(result, {
    action: { type: 'screenshot' },
    pending_safety_checks: [],
  })
})

test('normalizeGeminiAction reads coordinate_x/coordinate_y', () => {
  const result = normalizeGeminiAction('click_at', { coordinate_x: 700, coordinate_y: 500 })
  assert.equal(result.action.x, 700)
  assert.equal(result.action.y, 500)
})
