import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { normalizeComputerToolCallPayload } from '../src/adapters/client/anthropicClientAdapter/normalizeComputerToolCallPayload'

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
