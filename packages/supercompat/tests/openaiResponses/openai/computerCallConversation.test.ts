/**
 * Tests OpenAI Responses API conversation state for computer_call.
 * Verifies that previous_response_id chaining works correctly:
 * 1. Response with computer_call
 * 2. Submit computer_call_output via previous_response_id
 * 3. New user message via previous_response_id
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import OpenAI from 'openai'

const apiKey = process.env.TEST_OPENAI_API_KEY || process.env.OPENAI_API_KEY

if (!apiKey) {
  console.log('Skipping: TEST_OPENAI_API_KEY or OPENAI_API_KEY required')
  process.exit(0)
}

const client = new OpenAI({ apiKey })

describe('Responses API: computer_call with previous_response_id', { concurrency: true, timeout: 60_000 }, () => {
  test('full computer use cycle: call → output → follow-up message', async () => {
    // 1. Create response that triggers computer_call
    const r1 = await client.responses.create({
      model: 'gpt-5.4-mini',
      tools: [{ type: 'computer' as any }],
      input: 'Take a screenshot.',
      store: true,
    })

    const computerCall = r1.output.find((o: any) => o.type === 'computer_call') as any
    assert.ok(computerCall, 'Should get computer_call')
    console.log(`R1: ${r1.id}, call_id: ${computerCall.call_id}`)

    // 2. Submit output via previous_response_id (not conversation)
    let lastResponse = await client.responses.create({
      model: 'gpt-5.4-mini',
      tools: [{ type: 'computer' as any }],
      previous_response_id: r1.id,
      input: [{
        type: 'computer_call_output',
        call_id: computerCall.call_id,
        output: {
          type: 'computer_screenshot',
          image_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        },
        acknowledged_safety_checks: [],
      } as any],
      store: true,
    })
    console.log(`R2: ${lastResponse.id}, types: ${lastResponse.output.map((o: any) => o.type)}`)

    // 3. Handle any additional computer_calls
    for (let i = 0; i < 10; i++) {
      const pending = lastResponse.output.find((o: any) => o.type === 'computer_call') as any
      if (!pending) break
      lastResponse = await client.responses.create({
        model: 'gpt-5.4-mini',
        tools: [{ type: 'computer' as any }],
        previous_response_id: lastResponse.id,
        input: [{
          type: 'computer_call_output',
          call_id: pending.call_id,
          output: {
            type: 'computer_screenshot',
            image_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
          },
          acknowledged_safety_checks: [],
        } as any],
        store: true,
      })
    }

    // 4. Send new user message (simulates continuous loop)
    const followUp = await client.responses.create({
      model: 'gpt-5.4-mini',
      tools: [{ type: 'computer' as any }],
      previous_response_id: lastResponse.id,
      input: 'Now describe what you see on the screen.',
      store: true,
    })

    console.log(`Follow-up: ${followUp.id}, types: ${followUp.output.map((o: any) => o.type)}`)
    assert.ok(followUp.id, 'Follow-up message should succeed')
  })
})
