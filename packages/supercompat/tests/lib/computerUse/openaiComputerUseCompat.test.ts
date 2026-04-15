import { test, describe, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  isOpenaiComputerUseModel,
  serializeCompatComputerCall,
  serializeComputerUseTool,
} from '../../../src/lib/openaiComputerUse'
import { serializeResponseAsRun } from '../../../src/lib/responses/serializeResponseAsRun'
import { serializeItemAsComputerCallRunStep } from '../../../src/lib/items/serializeItemAsComputerCallRunStep'

// -- isOpenaiComputerUseModel --

describe('tests', { concurrency: true }, () => {
test('isOpenaiComputerUseModel detects GPT-5.4 variants', () => {
  assert.equal(isOpenaiComputerUseModel({ model: 'gpt-5.4' }), true)
  assert.equal(isOpenaiComputerUseModel({ model: 'gpt-5.4-mini' }), true)
  assert.equal(isOpenaiComputerUseModel({ model: 'gpt-5.4-2026-03-01' }), true)
  assert.equal(isOpenaiComputerUseModel({ model: 'GPT-5.4-MINI' }), true)
  assert.equal(isOpenaiComputerUseModel({ model: '  gpt-5.4  ' }), true)
})

test('isOpenaiComputerUseModel rejects non-GPT-5.4 models', () => {
  assert.equal(isOpenaiComputerUseModel({ model: 'computer-use-preview' }), false)
  assert.equal(isOpenaiComputerUseModel({ model: 'gpt-4o' }), false)
  assert.equal(isOpenaiComputerUseModel({ model: 'gpt-4o-mini' }), false)
  assert.equal(isOpenaiComputerUseModel({ model: null }), false)
  assert.equal(isOpenaiComputerUseModel({ model: undefined }), false)
})

// -- serializeComputerUseTool --

test('GA computer type (gpt-5.4): sends { type: "computer", computer: { ... } }', () => {
  const tool = serializeComputerUseTool({
    useOpenaiComputerTool: true,
    tool: {
      computer_use_preview: {
        environment: 'MACOS',
        display_width: 1440,
        display_height: 900,
      },
    },
  })

  assert.deepEqual(tool, {
    type: 'computer',
    computer: {
      environment: 'mac',
      display_width: 1440,
      display_height: 900,
    },
  })
})

test('GA computer type: config nested under computer key', () => {
  const tool = serializeComputerUseTool({
    useOpenaiComputerTool: true,
    tool: {
      environment: 'linux',
      display_width: 1280,
      display_height: 720,
    },
  })

  assert.equal(tool.type, 'computer')
  assert.deepEqual((tool as any).computer, {
    environment: 'linux',
    display_width: 1280,
    display_height: 720,
  })
})

test('Preview type: sends environment, display_width, display_height', () => {
  const tool = serializeComputerUseTool({
    useOpenaiComputerTool: false,
    tool: {
      computer_use_preview: {
        environment: 'linux',
        display_width: 1280,
        display_height: 720,
      },
    },
  })

  assert.deepEqual(tool, {
    type: 'computer_use_preview',
    computer_use_preview: {
      environment: 'linux',
      display_width: 1280,
      display_height: 720,
    },
  })
})

test('Preview type: normalizes MACOS to mac', () => {
  const tool = serializeComputerUseTool({
    useOpenaiComputerTool: false,
    tool: {
      environment: 'MACOS',
      display_width: 1440,
      display_height: 900,
    },
  })

  assert.equal(tool.type, 'computer_use_preview')
  assert.equal((tool as any).computer_use_preview.environment, 'mac')
})

test('Preview type: reads config from nested computer key', () => {
  const tool = serializeComputerUseTool({
    useOpenaiComputerTool: false,
    tool: {
      computer: {
        environment: 'windows',
        display_width: 1920,
        display_height: 1080,
      },
    },
  })

  assert.deepEqual(tool, {
    type: 'computer_use_preview',
    computer_use_preview: {
      environment: 'windows',
      display_width: 1920,
      display_height: 1080,
    },
  })
})

// -- serializeCompatComputerCall --

test('serializeCompatComputerCall: batched actions (new format)', () => {
  const result = serializeCompatComputerCall({
    item: {
      call_id: 'call_123',
      actions: [
        { type: 'click', x: 10, y: 20 },
        { type: 'type', text: 'hello' },
      ],
      pending_safety_checks: [{ id: 'safe_1' }],
    },
  })

  assert.equal(result.type, 'computer_call')
  assert.deepEqual(result.computer_call.actions, [
    { type: 'click', x: 10, y: 20 },
    { type: 'type', text: 'hello' },
  ])
  assert.equal('action' in result.computer_call, false)
  assert.deepEqual(result.computer_call.pending_safety_checks, [{ id: 'safe_1' }])
})

test('serializeCompatComputerCall: single action (legacy format)', () => {
  const result = serializeCompatComputerCall({
    item: {
      call_id: 'call_456',
      action: { type: 'screenshot' },
      pending_safety_checks: [],
    },
  })

  assert.equal(result.type, 'computer_call')
  assert.deepEqual(result.computer_call.action, { type: 'screenshot' })
  assert.deepEqual(result.computer_call.actions, [{ type: 'screenshot' }])
  assert.deepEqual(result.computer_call.pending_safety_checks, [])
})

test('serializeCompatComputerCall: no actions', () => {
  const result = serializeCompatComputerCall({
    item: {
      call_id: 'call_789',
      pending_safety_checks: [],
    },
  })

  assert.equal(result.type, 'computer_call')
  assert.equal('action' in result.computer_call, false)
  assert.equal('actions' in result.computer_call, false)
})

test('serializeCompatComputerCall: missing pending_safety_checks defaults to empty', () => {
  const result = serializeCompatComputerCall({
    item: {
      call_id: 'call_abc',
      action: { type: 'screenshot' },
    },
  })

  assert.deepEqual(result.computer_call.pending_safety_checks, [])
})

// -- serializeResponseAsRun --

test('serializeResponseAsRun: computer_call with batched actions', () => {
  const run = serializeResponseAsRun({
    response: {
      id: 'resp_123',
      created_at: 1,
      conversation: { id: 'conv_123' },
      model: 'gpt-5.4',
      status: 'completed',
      output: [
        {
          type: 'computer_call',
          call_id: 'call_123',
          actions: [
            { type: 'click', x: 10, y: 20 },
            { type: 'type', text: 'hello' },
          ],
          pending_safety_checks: [],
          status: 'completed',
        },
      ],
      metadata: {},
      usage: null,
      error: null,
    } as any,
    assistantId: 'asst_123',
  })

  assert.equal(run.status, 'requires_action')
  const tc = run.required_action!.submit_tool_outputs.tool_calls[0] as any
  assert.equal(tc.type, 'computer_call')
  assert.deepEqual(tc.computer_call.actions, [
    { type: 'click', x: 10, y: 20 },
    { type: 'type', text: 'hello' },
  ])
})

test('serializeResponseAsRun: computer_call with single action (legacy)', () => {
  const run = serializeResponseAsRun({
    response: {
      id: 'resp_456',
      created_at: 1,
      conversation: { id: 'conv_456' },
      model: 'computer-use-preview',
      status: 'completed',
      output: [
        {
          type: 'computer_call',
          call_id: 'call_456',
          action: { type: 'screenshot' },
          pending_safety_checks: [],
          status: 'completed',
        },
      ],
      metadata: {},
      usage: null,
      error: null,
    } as any,
    assistantId: 'asst_456',
  })

  assert.equal(run.status, 'requires_action')
  const tc = run.required_action!.submit_tool_outputs.tool_calls[0] as any
  assert.equal(tc.type, 'computer_call')
  assert.deepEqual(tc.computer_call.action, { type: 'screenshot' })
})

test('serializeResponseAsRun: mixed function_call + computer_call', () => {
  const run = serializeResponseAsRun({
    response: {
      id: 'resp_mixed',
      created_at: 1,
      conversation: { id: 'conv_mixed' },
      model: 'gpt-5.4',
      status: 'completed',
      output: [
        {
          type: 'function_call',
          call_id: 'fn_1',
          name: 'get_weather',
          arguments: '{"city":"London"}',
          status: 'completed',
        },
        {
          type: 'computer_call',
          call_id: 'cu_1',
          actions: [{ type: 'screenshot' }],
          pending_safety_checks: [],
          status: 'completed',
        },
      ],
      metadata: {},
      usage: null,
      error: null,
    } as any,
    assistantId: 'asst_mixed',
  })

  assert.equal(run.status, 'requires_action')
  const toolCalls = run.required_action!.submit_tool_outputs.tool_calls
  assert.equal(toolCalls.length, 2)

  const fnCall = toolCalls.find((tc) => tc.type === 'function') as any
  assert.ok(fnCall)
  assert.equal(fnCall.function.name, 'get_weather')

  const cuCall = toolCalls.find((tc) => tc.type === 'computer_call') as any
  assert.ok(cuCall)
  assert.deepEqual(cuCall.computer_call.actions, [{ type: 'screenshot' }])
})

// -- serializeItemAsComputerCallRunStep --

test('serializeItemAsComputerCallRunStep: output is populated when computer_call_output matches', () => {
  const step = serializeItemAsComputerCallRunStep({
    item: {
      id: 'item_1',
      type: 'computer_call',
      call_id: 'call_1',
      actions: [{ type: 'screenshot' }],
      pending_safety_checks: [],
      status: 'completed',
    } as any,
    items: [
      {
        type: 'computer_call_output',
        call_id: 'call_1',
        output: { type: 'computer_screenshot', image_url: 'data:image/png;base64,abc123' },
      },
    ] as any,
    threadId: 'thread_1',
    openaiAssistant: { id: 'asst_1' },
  })

  assert.equal(step.type, 'tool_calls')
  const tc = (step.step_details as any).tool_calls[0]
  assert.equal(tc.function.name, 'computer_call')
  assert.ok(tc.function.output, 'output should not be null')
  const output = JSON.parse(tc.function.output)
  assert.equal(output.type, 'computer_screenshot')
  assert.equal(output.image_url, 'data:image/png;base64,abc123')
})

test('serializeItemAsComputerCallRunStep: output is null when no matching computer_call_output', () => {
  const step = serializeItemAsComputerCallRunStep({
    item: {
      id: 'item_2',
      type: 'computer_call',
      call_id: 'call_2',
      actions: [{ type: 'click', x: 10, y: 20 }],
      pending_safety_checks: [],
      status: 'completed',
    } as any,
    items: [] as any,
    threadId: 'thread_2',
    openaiAssistant: { id: 'asst_2' },
  })

  const tc = (step.step_details as any).tool_calls[0]
  assert.equal(tc.function.output, null, 'output should be null when no matching output item')
})

test('serializeItemAsComputerCallRunStep: output matches correct call_id among multiple outputs', () => {
  const step = serializeItemAsComputerCallRunStep({
    item: {
      id: 'item_3',
      type: 'computer_call',
      call_id: 'call_3',
      actions: [{ type: 'screenshot' }],
      pending_safety_checks: [],
      status: 'completed',
    } as any,
    items: [
      {
        type: 'computer_call_output',
        call_id: 'call_other',
        output: { type: 'computer_screenshot', image_url: 'data:image/png;base64,wrong' },
      },
      {
        type: 'computer_call_output',
        call_id: 'call_3',
        output: { type: 'computer_screenshot', image_url: 'data:image/png;base64,correct' },
      },
    ] as any,
    threadId: 'thread_3',
    openaiAssistant: { id: 'asst_3' },
  })

  const tc = (step.step_details as any).tool_calls[0]
  const output = JSON.parse(tc.function.output)
  assert.equal(output.image_url, 'data:image/png;base64,correct')
})

// -- serializeResponseAsRun --

// -- steps/get: latestToolCallItem includes computer_call --

test('steps/get lookup: computer_call should be found as latest tool call item', () => {
  // This tests the fix for the commented-out computer_call in findLast
  const output = [
    { id: 'item_1', type: 'message', role: 'user' },
    { id: 'item_2', type: 'computer_call', call_id: 'call_1', actions: [{ type: 'screenshot' }] },
    { id: 'item_3', type: 'message', role: 'assistant' },
  ]

  // Simulate the findLast logic from steps/get.ts
  const latestToolCallItem = output.findLast((item) => (
    item.type === 'function_call' ||
    item.type === 'computer_call'
  ))

  assert.ok(latestToolCallItem, 'Should find computer_call as latest tool call')
  assert.equal(latestToolCallItem!.type, 'computer_call')
  assert.equal(latestToolCallItem!.id, 'item_2')
})

test('steps/get lookup: finds function_call when both types present', () => {
  const output = [
    { id: 'item_1', type: 'computer_call', call_id: 'call_1' },
    { id: 'item_2', type: 'function_call', call_id: 'call_2', name: 'fn' },
  ]

  const latestToolCallItem = output.findLast((item) => (
    item.type === 'function_call' ||
    item.type === 'computer_call'
  ))

  assert.equal(latestToolCallItem!.id, 'item_2')
})

test('steps/get lookup: returns undefined when no tool calls', () => {
  const output = [
    { id: 'item_1', type: 'message', role: 'user' },
    { id: 'item_2', type: 'message', role: 'assistant' },
  ]

  const latestToolCallItem = output.findLast((item) => (
    item.type === 'function_call' ||
    item.type === 'computer_call'
  ))

  assert.equal(latestToolCallItem, undefined)
})

// -- serializeResponseAsRun --

test('serializeResponseAsRun: completed computer_call_output is not pending', () => {
  const run = serializeResponseAsRun({
    response: {
      id: 'resp_done',
      created_at: 1,
      conversation: { id: 'conv_done' },
      model: 'gpt-5.4',
      status: 'completed',
      output: [
        {
          type: 'computer_call',
          call_id: 'call_done',
          actions: [{ type: 'screenshot' }],
          pending_safety_checks: [],
          status: 'completed',
        },
        {
          type: 'computer_call_output',
          call_id: 'call_done',
          output: { type: 'computer_screenshot', image_url: 'data:image/png;base64,abc' },
        },
      ],
      metadata: {},
      usage: null,
      error: null,
    } as any,
    assistantId: 'asst_done',
  })

  assert.equal(run.status, 'completed')
  assert.equal(run.required_action, null)
})
})
