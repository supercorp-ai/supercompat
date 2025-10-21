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
})

test('normalizeComputerToolCallPayload converts scroll action', () => {
  const result = normalizeComputerToolCallPayload({
    action: 'scroll',
    coordinate: [400, 250],
    scroll_direction: 'down',
    scroll_amount: 3,
  })

  assert.equal(result.action.type, 'scroll')
  assert.equal(result.action.direction, 'down')
  assert.equal(result.action.amount, 3)
  assert.equal(result.action.x, 400)
  assert.equal(result.action.y, 250)
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
