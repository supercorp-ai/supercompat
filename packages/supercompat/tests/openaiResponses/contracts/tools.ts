import type OpenAI from 'openai'
import assert from 'node:assert/strict'
import { config } from './lib/config'
import * as fixtures from './lib/fixtures'
import { assertResponseShape, assertFunctionCallOutputItem } from './lib/assertions'

export type ResponsesContract = (client: OpenAI) => Promise<void>

export const functionCall: ResponsesContract = async (client) => {
  const response = await client.responses.create({
    model: config.model,
    instructions: 'You MUST call the get_weather tool. NEVER answer without calling it first.',
    input: 'What is the weather in London?',
    tools: [fixtures.weatherTool],
  })

  assertResponseShape(response, 'function call')
  assert.equal(response.status, 'completed')

  const functionCallItem = response.output.find((o: any) => o.type === 'function_call')
  assert.ok(functionCallItem, 'Should have function_call output item')
  assertFunctionCallOutputItem(functionCallItem, 'function call item')
  assert.equal(functionCallItem.name, 'get_weather')

  const args = JSON.parse(functionCallItem.arguments)
  assert.equal(typeof args.city, 'string')
}

export const functionCallRoundTrip: ResponsesContract = async (client) => {
  // Step 1: trigger function call
  const response1 = await client.responses.create({
    model: config.model,
    instructions: 'You MUST call the get_weather tool. NEVER answer without calling it first.',
    input: 'What is the weather in Paris?',
    tools: [fixtures.weatherTool],
  })

  const functionCallItem = response1.output.find((o: any) => o.type === 'function_call')
  assert.ok(functionCallItem, 'Should have function_call')

  // Step 2: submit function output and get final response
  const response2 = await client.responses.create({
    model: config.model,
    instructions: 'You MUST call the get_weather tool. NEVER answer without calling it first.',
    input: [
      // Re-send the function call as input
      {
        type: 'function_call' as const,
        call_id: functionCallItem.call_id,
        name: functionCallItem.name,
        arguments: functionCallItem.arguments,
      },
      // Send the function output
      {
        type: 'function_call_output' as const,
        call_id: functionCallItem.call_id,
        output: fixtures.weatherToolOutput,
      },
    ],
    tools: [fixtures.weatherTool],
  })

  assertResponseShape(response2, 'round trip')
  assert.equal(response2.status, 'completed')

  // Should have a text response that references the weather
  const messageItem = response2.output.find((o: any) => o.type === 'message')
  assert.ok(messageItem, 'Should have message output')
  const text = messageItem.content[0]?.text?.toLowerCase() ?? ''
  assert.ok(text.includes('72') || text.includes('sunny') || text.includes('paris'),
    `Response should reference weather data. Got: "${text.slice(0, 100)}"`)
}

export const parallelFunctionCalls: ResponsesContract = async (client) => {
  const response = await client.responses.create({
    model: config.model,
    instructions: 'CRITICAL: You MUST call BOTH get_weather AND calculate tools simultaneously in a single response.',
    input: 'I need TWO things: 1) get_weather for London 2) calculate 15 * 23. Call BOTH tools.',
    tools: [fixtures.weatherTool, fixtures.calculatorTool],
  })

  assertResponseShape(response, 'parallel')
  assert.equal(response.status, 'completed')

  const functionCalls = response.output.filter((o: any) => o.type === 'function_call')
  assert.ok(functionCalls.length >= 2, `Should have at least 2 function calls, got ${functionCalls.length}`)

  const names = functionCalls.map((fc: any) => fc.name).sort()
  assert.ok(names.includes('get_weather'), 'Should call get_weather')
  assert.ok(names.includes('calculate'), 'Should call calculate')
}
