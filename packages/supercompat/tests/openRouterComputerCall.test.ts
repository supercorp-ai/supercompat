import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { denormalizeComputerCallArguments } from '../src/adapters/client/openRouterClientAdapter/completions/normalizeComputerCall.ts'

const DISPLAY_WIDTH = 1280
const DISPLAY_HEIGHT = 720

// --- Gemini (google/) models — uses 0-1000 normalized coordinates ---

test('Gemini: nested action with normalized coords are denormalized', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: JSON.stringify({
      action: { type: 'click', x: 500, y: 500 },
    }),
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'google/gemini-3-flash-preview',
  })

  const parsed = JSON.parse(result)
  assert.equal(parsed.action.type, 'click')
  assert.equal(parsed.action.x, 640) // 500/1000 * 1280
  assert.equal(parsed.action.y, 360) // 500/1000 * 720
})

test('Gemini: flat format with type field is normalized and denormalized', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: JSON.stringify({
      type: 'click',
      x: 100,
      y: 200,
    }),
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'google/gemini-3-flash-preview',
  })

  const parsed = JSON.parse(result)
  assert.equal(parsed.action.type, 'click')
  assert.equal(parsed.action.x, 128) // 100/1000 * 1280
  assert.equal(parsed.action.y, 144) // 200/1000 * 720
})

test('Gemini: flat format with string action is normalized and denormalized', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: JSON.stringify({
      action: 'click',
      x: 100,
      y: 200,
    }),
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'google/gemini-3-flash-preview',
  })

  const parsed = JSON.parse(result)
  assert.equal(parsed.action.type, 'click')
  assert.equal(parsed.action.x, 128) // 100/1000 * 1280
  assert.equal(parsed.action.y, 144) // 200/1000 * 720
})

test('Gemini: screenshot action (no coords to denormalize)', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: JSON.stringify({
      action: { type: 'screenshot' },
    }),
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'google/gemini-3-flash-preview',
  })

  const parsed = JSON.parse(result)
  assert.equal(parsed.action.type, 'screenshot')
})

test('Gemini: corner coordinates denormalize correctly', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: JSON.stringify({
      action: { type: 'click', x: 0, y: 999 },
    }),
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'google/gemini-3-flash-preview',
  })

  const parsed = JSON.parse(result)
  assert.equal(parsed.action.x, 0)       // 0/1000 * 1280
  assert.equal(parsed.action.y, 719)     // 999/1000 * 720
})

test('Gemini: already-parsed object arguments are handled', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: { action: { type: 'screenshot' } } as any,
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'google/gemini-3-flash-preview',
  })

  const parsed = JSON.parse(result)
  assert.equal(parsed.action.type, 'screenshot')
})

// --- GLM model (normalized coordinates + artifact cleanup) ---

test('GLM: normalized coordinates are denormalized to pixels', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: JSON.stringify({
      action: { type: 'click', x: 500, y: 500 },
    }),
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'z-ai/glm-4.6v',
  })

  const parsed = JSON.parse(result)
  assert.equal(parsed.action.type, 'click')
  assert.equal(parsed.action.x, 640) // 500/1000 * 1280
  assert.equal(parsed.action.y, 360) // 500/1000 * 720
})

// --- Qwen model (fuzzy fallback) ---

test('Qwen: fuzzy extraction from malformed JSON', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: '{"type": "click", "x": [168, 621]',
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'qwen/qwen-2.5-72b-instruct',
  })

  const parsed = JSON.parse(result)
  assert.equal(parsed.action.type, 'click')
  assert.equal(parsed.action.x, 168)
  assert.equal(parsed.action.y, 621)
})

// --- Generic model (no quirks — pixel coordinates pass through) ---

test('Generic model: nested action passes through without denormalization', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: JSON.stringify({
      action: { type: 'type', text: 'hello world' },
      pending_safety_checks: [],
    }),
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'some/unknown-model',
  })

  const parsed = JSON.parse(result)
  assert.equal(parsed.action.type, 'type')
  assert.equal(parsed.action.text, 'hello world')
  assert.deepEqual(parsed.pending_safety_checks, [])
})

test('Generic model: flat type format is normalized to nested', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: JSON.stringify({
      type: 'screenshot',
    }),
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'some/unknown-model',
  })

  const parsed = JSON.parse(result)
  assert.equal(parsed.action.type, 'screenshot')
})
