import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import { denormalizeComputerCallArguments } from '../../../src/adapters/client/ollamaClientAdapter/completions/normalizeComputerCall.ts'

const DISPLAY_WIDTH = 1280
const DISPLAY_HEIGHT = 720

// --- Gemma (normalizedCoords + fuzzyFallback) ---

describe('ollama computer_call normalization', { concurrency: true }, () => {
test('Gemma: normalized coordinates are denormalized to pixels', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: JSON.stringify({ action: { type: 'click', x: 500, y: 500 } }),
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'gemma4',
  })

  const parsed = JSON.parse(result)
  assert.equal(parsed.action.type, 'click')
  assert.equal(parsed.action.x, 640) // 500/1000 * 1280
  assert.equal(parsed.action.y, 360) // 500/1000 * 720
})

test('Gemma tagged variant: prefix still catches gemma4:26b', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: JSON.stringify({ action: { type: 'click', x: 250, y: 750 } }),
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'gemma4:26b',
  })

  const parsed = JSON.parse(result)
  assert.equal(parsed.action.x, 320) // 250/1000 * 1280
  assert.equal(parsed.action.y, 540) // 750/1000 * 720
})

test('Gemma: box_2d fuzzy fallback converts to click at center', () => {
  // Gemma 4 sometimes replies with object-detection-style output
  // `[{"box_2d": [y1, x1, y2, x2], "label": "..."}]` instead of a
  // well-formed computer_call. We should translate it to a click at
  // the box's center — still in the 0-1000 normalized space, then
  // denormalized to pixels.
  const result = denormalizeComputerCallArguments({
    argumentsText: 'Here is the target: [{"box_2d": [100, 200, 300, 400], "label": "button"}]',
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'gemma4',
  })

  const parsed = JSON.parse(result)
  assert.equal(parsed.action.type, 'click')
  // center_x = (200 + 400) / 2 = 300 → 300/1000 * 1280 = 384
  assert.equal(parsed.action.x, 384)
  // center_y = (100 + 300) / 2 = 200 → 200/1000 * 720 = 144
  assert.equal(parsed.action.y, 144)
})

test('Gemma3: same prefix-match behaviour as gemma4', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: JSON.stringify({ action: { type: 'click', x: 1000, y: 0 } }),
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'gemma3:12b',
  })

  const parsed = JSON.parse(result)
  assert.equal(parsed.action.x, 1280)
  assert.equal(parsed.action.y, 0)
})

// --- GLM (normalizedCoords + cleanArtifacts) ---

test('GLM: <arg_value> tag embedded in type field is extracted', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: JSON.stringify({
      action: {
        type: 'click\n<arg_key>parameters</arg_key>\n<arg_value>{"type":"click","x":167,"y":622}',
      },
    }),
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'glm-4.6v',
  })

  const parsed = JSON.parse(result)
  assert.equal(parsed.action.type, 'click')
  // 167 and 622 are in normalized 0-1000 → denormalize
  assert.equal(parsed.action.x, 214) // round(167/1000 * 1280)
  assert.equal(parsed.action.y, 448) // round(622/1000 * 720)
})

test('GLM: begin_of_box/end_of_box artifacts stripped from content', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: '<|begin_of_box|>{"action":{"type":"screenshot"}}<|end_of_box|>',
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'glm4.6v',
  })

  const parsed = JSON.parse(result)
  assert.equal(parsed.action.type, 'screenshot')
})

// --- Qwen (fuzzyFallback) ---

test('Qwen: fuzzy extraction from malformed JSON', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: '{"type": "click", "x": [168, 621]',
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'qwen2.5vl:32b',
  })

  const parsed = JSON.parse(result)
  assert.equal(parsed.action.type, 'click')
  assert.equal(parsed.action.x, 168)
  assert.equal(parsed.action.y, 621)
})

// --- Kimi (relativeCoords to 1920x1080 reference) ---

test('Kimi: 1920x1080-referenced pixel coords rescale to display', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: JSON.stringify({ action: { type: 'click', x: 960, y: 540 } }),
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'kimi-k2.5:latest',
  })

  const parsed = JSON.parse(result)
  // 960/1920 * 1280 = 640, 540/1080 * 720 = 360
  assert.equal(parsed.action.x, 640)
  assert.equal(parsed.action.y, 360)
})

test('Kimi: 0.0-1.0 relative coords also rescale', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: JSON.stringify({ action: { type: 'click', x: 0.5, y: 0.5 } }),
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'kimi2.5',
  })

  const parsed = JSON.parse(result)
  assert.equal(parsed.action.x, 640)
  assert.equal(parsed.action.y, 360)
})

// --- Generic model (no quirks — pixel coords pass through) ---

test('Generic model: nested action passes through without denormalization', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: JSON.stringify({
      action: { type: 'type', text: 'hello world' },
      pending_safety_checks: [],
    }),
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'llama3.2',
  })

  const parsed = JSON.parse(result)
  assert.equal(parsed.action.type, 'type')
  assert.equal(parsed.action.text, 'hello world')
  assert.deepEqual(parsed.pending_safety_checks, [])
})

test('Generic model: flat type format is normalized to nested', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: JSON.stringify({ type: 'screenshot' }),
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'llama3.2',
  })

  const parsed = JSON.parse(result)
  assert.equal(parsed.action.type, 'screenshot')
})

test('Generic model: flat string action normalizes to nested type', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: JSON.stringify({ action: 'click', x: 100, y: 200 }),
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'llama3.2',
  })

  const parsed = JSON.parse(result)
  assert.equal(parsed.action.type, 'click')
  assert.equal(parsed.action.x, 100)
  assert.equal(parsed.action.y, 200)
})

// --- Drag path denormalization (verifies coord rescaling reaches path[]) ---

test('Gemma: drag path points are denormalized', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: JSON.stringify({
      action: {
        type: 'drag',
        path: [{ x: 100, y: 100 }, { x: 500, y: 500 }],
      },
    }),
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'gemma4',
  })

  const parsed = JSON.parse(result)
  assert.equal(parsed.action.path.length, 2)
  assert.equal(parsed.action.path[0].x, 128)
  assert.equal(parsed.action.path[0].y, 72)
  assert.equal(parsed.action.path[1].x, 640)
  assert.equal(parsed.action.path[1].y, 360)
})

// --- Edge cases ---

test('Empty string passes through unchanged', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: '',
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'gemma4',
  })

  assert.equal(result, '')
})

test('Non-JSON garbage without fuzzy match returns original text', () => {
  const result = denormalizeComputerCallArguments({
    argumentsText: 'definitely not json',
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    model: 'gemma4',
  })

  assert.equal(result, 'definitely not json')
})
})
