import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { serializeMessage } from '../src/adapters/run/completionsRunAdapter/messages/serializeMessage.ts'

const makeMessage = ({
  toolCalls,
  runStepToolCalls,
}: {
  toolCalls: any[]
  runStepToolCalls: any[]
}) => ({
  role: 'assistant',
  content: [{ text: { value: '' }, type: 'text' }],
  metadata: { toolCalls },
  run: {
    runSteps: [
      {
        type: 'tool_calls',
        step_details: {
          tool_calls: runStepToolCalls,
        },
      },
    ],
  },
})

test('computer_screenshot: image_url content in tool message, no extra user message', () => {
  const screenshotOutput = JSON.stringify({
    type: 'computer_screenshot',
    image_url: 'data:image/png;base64,iVBORw0KGgoAAAANS',
  })

  const toolCall = {
    id: 'tc_1',
    type: 'function',
    function: {
      name: 'computer_call',
      arguments: '{"action":{"type":"screenshot"}}',
      output: screenshotOutput,
    },
  }

  const messages = serializeMessage({
    message: makeMessage({
      toolCalls: [toolCall],
      runStepToolCalls: [toolCall],
    }),
  } as any)

  // Should produce: assistant message + tool message (no extra user message)
  assert.equal(messages.length, 2, `Expected 2 messages, got ${messages.length}`)

  // Tool message should have image_url content, not the raw base64 JSON string
  const toolMsg = messages[1] as any
  assert.equal(toolMsg.role, 'tool')
  assert.ok(Array.isArray(toolMsg.content), 'Tool message content should be an array')
  assert.equal(toolMsg.content[0].type, 'image_url')
  assert.equal(toolMsg.content[0].image_url.url, 'data:image/png;base64,iVBORw0KGgoAAAANS')
})

test('computer_screenshot: base64 string is NOT sent as text', () => {
  const screenshotOutput = JSON.stringify({
    type: 'computer_screenshot',
    image_url: 'data:image/png;base64,AAAA',
  })

  const toolCall = {
    id: 'tc_1',
    type: 'function',
    function: {
      name: 'computer_call',
      arguments: '{"action":{"type":"screenshot"}}',
      output: screenshotOutput,
    },
  }

  const messages = serializeMessage({
    message: makeMessage({
      toolCalls: [toolCall],
      runStepToolCalls: [toolCall],
    }),
  } as any)

  const toolMsg = messages[1] as any
  // Content should NOT be the raw JSON string
  assert.notEqual(typeof toolMsg.content, 'string', 'Content should not be a raw string')
})

test('regular function output: unchanged', () => {
  const toolCall = {
    id: 'tc_1',
    type: 'function',
    function: {
      name: 'get_weather',
      arguments: '{"city":"NYC"}',
      output: '{"temp": 72}',
    },
  }

  const messages = serializeMessage({
    message: makeMessage({
      toolCalls: [toolCall],
      runStepToolCalls: [toolCall],
    }),
  } as any)

  assert.equal(messages.length, 2)

  const toolMsg = messages[1] as any
  assert.equal(toolMsg.role, 'tool')
  assert.equal(toolMsg.content, '{"temp": 72}')
})

test('image_url array output passes through via validToolCallContentTypes', () => {
  const toolCall = {
    id: 'tc_1',
    type: 'function',
    function: {
      name: 'computer_call',
      arguments: '{}',
      output: [
        { type: 'image_url', image_url: { url: 'data:image/png;base64,BBBB' } },
      ],
    },
  }

  const messages = serializeMessage({
    message: makeMessage({
      toolCalls: [toolCall],
      runStepToolCalls: [toolCall],
    }),
  } as any)

  const toolMsg = messages[1] as any
  assert.ok(Array.isArray(toolMsg.content))
  assert.equal(toolMsg.content[0].type, 'image_url')
})
