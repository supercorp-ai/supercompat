import type OpenAI from 'openai'
import assert from 'node:assert/strict'
import { config } from './lib/config'
import { assertResponseShape } from './lib/assertions'

export type ResponsesContract = (client: OpenAI) => Promise<void>

export const structuredOutput: ResponsesContract = async (client) => {
  const response = await client.responses.create({
    model: config.model,
    input: 'What is 2+2? Reply with JSON.',
    text: {
      format: {
        type: 'json_schema',
        name: 'math_result',
        schema: {
          type: 'object',
          properties: {
            result: { type: 'number' },
          },
          required: ['result'],
          additionalProperties: false,
        },
        strict: true,
      },
    },
  })

  assertResponseShape(response, 'structured output')
  assert.equal(response.status, 'completed')

  const messageItem = response.output.find((o: any) => o.type === 'message')
  assert.ok(messageItem, 'Should have message')
  let text = messageItem.content[0]?.text ?? ''
  // Strip markdown code fences if model wraps JSON in them
  text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  const parsed = JSON.parse(text)
  assert.equal(parsed.result, 4)
}

export const toolChoice: ResponsesContract = async (client) => {
  const response = await client.responses.create({
    model: config.model,
    input: 'Hello!',
    tools: [{
      type: 'function',
      name: 'greet',
      description: 'Greet the user',
      parameters: { type: 'object', properties: { greeting: { type: 'string' } }, required: ['greeting'] },
    }],
    tool_choice: { type: 'function', name: 'greet' },
  })

  assertResponseShape(response, 'tool_choice')
  assert.equal(response.status, 'completed')

  const functionCall = response.output.find((o: any) => o.type === 'function_call')
  assert.ok(functionCall, 'Should have function_call when tool_choice forces it')
  assert.equal(functionCall.name, 'greet')
}

export const truncationAuto: ResponsesContract = async (client) => {
  const response = await client.responses.create({
    model: config.model,
    input: 'Say hi.',
    truncation: 'auto',
  })

  assertResponseShape(response, 'truncation auto')
  assert.equal(response.status, 'completed')
}

export const maxOutputTokens: ResponsesContract = async (client) => {
  const response = await client.responses.create({
    model: config.model,
    input: 'Write a very long story.',
    max_output_tokens: 50,
  })

  assertResponseShape(response, 'max_output_tokens')
  // Should complete (possibly with incomplete status due to token limit)
  assert.ok(
    response.status === 'completed' || response.status === 'incomplete',
    `Status should be completed or incomplete, got ${response.status}`,
  )
}

export const temperatureParam: ResponsesContract = async (client) => {
  const response = await client.responses.create({
    model: config.model,
    input: 'Say hi.',
    temperature: 0,
  })

  assertResponseShape(response, 'temperature')
  assert.equal(response.status, 'completed')
}
