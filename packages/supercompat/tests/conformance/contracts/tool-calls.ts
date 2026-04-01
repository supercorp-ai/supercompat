import type OpenAI from 'openai'
import assert from 'node:assert/strict'
import {
  assertRunShape,
  assertRequiredActionShape,
  assertRunStepShape,
  assertMessageShape,
  assertStreamEvent,
  assertEventOrder,
  collectStreamEvents,
} from '../lib/assertions'
import { cleanup } from '../lib/clients'
import * as fixtures from '../lib/fixtures'

export type Contract = (client: OpenAI) => Promise<void>

export const toolCallRoundTripPoll: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: 'gpt-4.1-mini',
    instructions: fixtures.instructions.forceWeatherTool,
    tools: [fixtures.weatherTool],
  })
  const thread = await client.beta.threads.create()
  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: fixtures.prompts.weather,
  })

  // Run should stop at requires_action
  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
    tools: [fixtures.weatherTool],
  })

  assertRunShape(run, 'requires_action run')
  assert.equal(run.status, 'requires_action')
  assert.ok(run.required_action, 'Should have required_action')
  assertRequiredActionShape(run.required_action, 'required_action')

  const toolCalls = run.required_action!.submit_tool_outputs.tool_calls
  assert.equal(toolCalls.length, 1)
  assert.equal(toolCalls[0].function.name, 'get_weather')

  // Arguments should be valid JSON containing the city
  const args = JSON.parse(toolCalls[0].function.arguments)
  assert.ok(args.city, 'Should have city argument')

  // Submit tool output
  const completed = await client.beta.threads.runs.submitToolOutputsAndPoll(
    run.id,
    {
      thread_id: thread.id,
      tool_outputs: [{
        tool_call_id: toolCalls[0].id,
        output: fixtures.weatherToolOutput,
      }],
    },
  )

  assertRunShape(completed, 'completed run')
  assert.equal(completed.status, 'completed')
  assert.ok(completed.usage, 'Completed run should have usage')

  // Assistant message should exist and reference the run
  const messages = await client.beta.threads.messages.list(thread.id)
  const assistantMsg = messages.data.find(m => m.role === 'assistant')
  assert.ok(assistantMsg, 'Should have assistant message')
  assertMessageShape(assistantMsg, 'assistant message after tool')
  assert.equal(assistantMsg.run_id, run.id)

  // Run steps should have tool_calls + message_creation
  const steps = await client.beta.threads.runs.steps.list(run.id, { thread_id: thread.id })
  const toolStep = steps.data.find(s => s.type === 'tool_calls')
  assert.ok(toolStep, 'Should have tool_calls step')
  assertRunStepShape(toolStep, 'tool_calls step')
  assert.equal(toolStep.status, 'completed')

  const tc = (toolStep.step_details as any).tool_calls[0]
  assert.equal(tc.type, 'function')
  assert.equal(tc.function.name, 'get_weather')
  assert.ok(tc.function.output, 'Tool call should have output after submit')
  assert.ok(tc.function.output.includes('72'), 'Output should contain submitted value')

  const msgStep = steps.data.find(s => s.type === 'message_creation')
  assert.ok(msgStep, 'Should have message_creation step')
  assert.equal(
    (msgStep.step_details as any).message_creation.message_id,
    assistantMsg.id,
    'message_creation step should reference the assistant message',
  )

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}

export const toolCallRoundTripStream: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: 'gpt-4.1-mini',
    instructions: fixtures.instructions.forceWeatherTool,
    tools: [fixtures.weatherTool],
  })
  const thread = await client.beta.threads.create()
  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: fixtures.prompts.weather,
  })

  const stream = await client.beta.threads.runs.create(thread.id, {
    assistant_id: assistant.id,
    tools: [fixtures.weatherTool],
    stream: true,
  })

  const events = await collectStreamEvents(stream)

  for (const event of events) {
    assertStreamEvent(event, 'tool call stream event')
  }

  // Should reach requires_action
  assertEventOrder(events, [
    'thread.run.created',
    'thread.run.in_progress',
    'thread.run.requires_action',
  ])

  const requiresAction = events.find(e => e.event === 'thread.run.requires_action')!
  assertRunShape(requiresAction.data, 'requires_action run')
  assert.equal(requiresAction.data.status, 'requires_action')
  assertRequiredActionShape(requiresAction.data.required_action!)

  const toolCalls = requiresAction.data.required_action.submit_tool_outputs.tool_calls
  assert.equal(toolCalls[0].function.name, 'get_weather')

  // Submit via stream
  const submitStream = await client.beta.threads.runs.submitToolOutputs(
    requiresAction.data.id,
    {
      thread_id: thread.id,
      tool_outputs: [{
        tool_call_id: toolCalls[0].id,
        output: fixtures.weatherToolOutput,
      }],
      stream: true,
    },
  )

  const submitEvents = await collectStreamEvents(submitStream)

  for (const event of submitEvents) {
    assertStreamEvent(event, 'submit stream event')
  }

  // Should complete after submit
  const completed = submitEvents.find(e => e.event === 'thread.run.completed')
  assert.ok(completed, 'Should have run.completed after submit')
  assert.equal(completed!.data.status, 'completed')

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}

export const toolOutputPreserved: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: 'gpt-4.1-mini',
    instructions: fixtures.instructions.forceWeatherTool,
    tools: [fixtures.weatherTool],
  })
  const thread = await client.beta.threads.create()
  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: fixtures.prompts.weather,
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
    tools: [fixtures.weatherTool],
  })

  const toolCallId = run.required_action!.submit_tool_outputs.tool_calls[0].id
  const specificOutput = JSON.stringify({ temp: 99, unit: 'C', conditions: 'volcanic' })

  await client.beta.threads.runs.submitToolOutputsAndPoll(run.id, {
    thread_id: thread.id,
    tool_outputs: [{ tool_call_id: toolCallId, output: specificOutput }],
  })

  // Verify the exact output string is preserved in the step
  const steps = await client.beta.threads.runs.steps.list(run.id, { thread_id: thread.id })
  const toolStep = steps.data.find(s => s.type === 'tool_calls')
  const output = (toolStep!.step_details as any).tool_calls[0].function.output

  assert.equal(output, specificOutput, 'Tool output should be preserved exactly as submitted')

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}

export const continueAfterToolCall: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: 'gpt-4.1-mini',
    instructions: fixtures.instructions.forceWeatherTool,
    tools: [fixtures.weatherTool],
  })
  const thread = await client.beta.threads.create()

  // Turn 1: tool call
  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: fixtures.prompts.weather,
  })
  const run1 = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
    tools: [fixtures.weatherTool],
  })
  assert.equal(run1.status, 'requires_action')

  const tc = run1.required_action!.submit_tool_outputs.tool_calls[0]
  await client.beta.threads.runs.submitToolOutputsAndPoll(run1.id, {
    thread_id: thread.id,
    tool_outputs: [{ tool_call_id: tc.id, output: fixtures.weatherToolOutput }],
  })

  // Turn 2: simple follow-up (no tools needed)
  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Thanks! Now just say goodbye.',
  })
  const run2 = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
  })
  assert.equal(run2.status, 'completed', 'Follow-up run should complete without tool call')

  // All messages should be present
  const messages = await client.beta.threads.messages.list(thread.id)
  const userMsgs = messages.data.filter(m => m.role === 'user')
  const assistantMsgs = messages.data.filter(m => m.role === 'assistant')
  assert.equal(userMsgs.length, 2)
  assert.equal(assistantMsgs.length, 2)

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}

// --- File search ---

export const fileSearchCall: Contract = async (client) => {
  // Create a file with searchable content
  const fileContent = new Blob(
    ['The secret project codename is Operation Thunderbolt. It launched on March 15, 2026. The budget was $4.2 million.'],
    { type: 'text/plain' },
  )
  const file = await client.files.create({
    file: new File([fileContent], 'project-info.txt'),
    purpose: 'assistants',
  })

  // Create vector store with the file
  const vectorStore = await client.vectorStores.create({
    name: 'Conformance Test Store',
    file_ids: [file.id],
  })

  // Wait for file to be indexed
  for (let i = 0; i < 30; i++) {
    const vs = await client.vectorStores.retrieve(vectorStore.id)
    if (vs.file_counts.completed > 0) break
    await new Promise(r => setTimeout(r, 1000))
  }

  const assistant = await client.beta.assistants.create({
    model: 'gpt-4.1-mini',
    instructions: 'Answer questions using ONLY the file search results. Always cite the source.',
    tools: [{ type: 'file_search' }],
    tool_resources: {
      file_search: {
        vector_store_ids: [vectorStore.id],
      },
    },
  })

  const thread = await client.beta.threads.create()
  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is the secret project codename and when did it launch?',
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
  })

  assert.equal(run.status, 'completed', 'File search runs should complete without requires_action')

  // Steps should have a file_search step
  const steps = await client.beta.threads.runs.steps.list(run.id, { thread_id: thread.id })
  const searchStep = steps.data.find(s =>
    s.type === 'tool_calls' &&
    (s.step_details as any).tool_calls?.some((tc: any) => tc.type === 'file_search'),
  )
  assert.ok(searchStep, `Should have file_search step. Step types: ${steps.data.map(s => {
    if (s.type === 'tool_calls') return (s.step_details as any).tool_calls?.map((tc: any) => tc.type)
    return s.type
  })}`)
  assertRunStepShape(searchStep!, 'file_search step')

  const searchCall = (searchStep!.step_details as any).tool_calls.find(
    (tc: any) => tc.type === 'file_search',
  )
  assert.ok(searchCall.file_search, 'Should have file_search details')

  // Assistant response should mention the codename
  const messages = await client.beta.threads.messages.list(thread.id)
  const assistantMsg = messages.data.find(m => m.role === 'assistant')
  assert.ok(assistantMsg)
  const text = (assistantMsg.content[0] as any).text?.value?.toLowerCase() ?? ''
  assert.ok(
    text.includes('thunderbolt') || text.includes('operation'),
    `Response should mention the codename. Got: "${text.slice(0, 200)}"`,
  )

  // Cleanup
  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
  await client.vectorStores.delete(vectorStore.id)
  await client.files.delete(file.id)
}

// --- Parallel tool calls ---

export const parallelToolCalls: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: 'gpt-4.1-mini',
    instructions: fixtures.instructions.forceParallelTools,
    tools: [fixtures.weatherTool, fixtures.calculatorTool],
  })
  const thread = await client.beta.threads.create()
  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: fixtures.prompts.parallelTools,
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
    tools: [fixtures.weatherTool, fixtures.calculatorTool],
  })

  assert.equal(run.status, 'requires_action')
  const toolCalls = run.required_action!.submit_tool_outputs.tool_calls
  assert.ok(toolCalls.length >= 2, `Expected at least 2 parallel tool calls, got ${toolCalls.length}`)

  const names = toolCalls.map(tc => tc.function.name).sort()
  assert.ok(names.includes('get_weather'), 'Should call get_weather')
  assert.ok(names.includes('calculate'), 'Should call calculate')

  // Each tool call should have unique ID
  const ids = new Set(toolCalls.map(tc => tc.id))
  assert.equal(ids.size, toolCalls.length, 'Each tool call should have unique id')

  // Submit all outputs at once
  const completed = await client.beta.threads.runs.submitToolOutputsAndPoll(
    run.id,
    {
      thread_id: thread.id,
      tool_outputs: toolCalls.map(tc => ({
        tool_call_id: tc.id,
        output: tc.function.name === 'get_weather'
          ? fixtures.weatherToolOutput
          : fixtures.calculatorToolOutput,
      })),
    },
  )

  assert.equal(completed.status, 'completed')

  // Steps should have a tool_calls step with multiple calls
  const steps = await client.beta.threads.runs.steps.list(run.id, { thread_id: thread.id })
  const toolStep = steps.data.find(s => s.type === 'tool_calls')
  assert.ok(toolStep)
  const stepCalls = (toolStep!.step_details as any).tool_calls
  assert.ok(stepCalls.length >= 2, 'Step should have multiple tool calls')

  for (const tc of stepCalls) {
    assert.ok(tc.function.output, `Tool call ${tc.function.name} should have output`)
  }

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}

// --- No-argument tool ---

export const noArgToolCall: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: 'gpt-4.1-mini',
    instructions: fixtures.instructions.forceNoArgsTool,
    tools: [fixtures.noArgsTool],
  })
  const thread = await client.beta.threads.create()
  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: fixtures.prompts.noArgs,
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
    tools: [fixtures.noArgsTool],
  })

  assert.equal(run.status, 'requires_action')
  const tc = run.required_action!.submit_tool_outputs.tool_calls[0]
  assert.equal(tc.function.name, 'get_timestamp')

  const args = JSON.parse(tc.function.arguments)
  assert.equal(typeof args, 'object')

  const completed = await client.beta.threads.runs.submitToolOutputsAndPoll(
    run.id,
    {
      thread_id: thread.id,
      tool_outputs: [{ tool_call_id: tc.id, output: fixtures.noArgsToolOutput }],
    },
  )
  assert.equal(completed.status, 'completed')

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}

// --- Complex arguments ---

export const complexArgsToolCall: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: 'gpt-4.1-mini',
    instructions: fixtures.instructions.forceComplexArgsTool,
    tools: [fixtures.complexArgsTool],
  })
  const thread = await client.beta.threads.create()
  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: fixtures.prompts.complexArgs,
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
    tools: [fixtures.complexArgsTool],
  })

  assert.equal(run.status, 'requires_action')
  const tc = run.required_action!.submit_tool_outputs.tool_calls[0]
  assert.equal(tc.function.name, 'create_report')

  const args = JSON.parse(tc.function.arguments)
  assert.equal(typeof args.title, 'string')
  assert.ok(Array.isArray(args.sections), 'sections should be array')
  assert.ok(args.sections.length >= 2, 'Should have at least 2 sections')
  assert.equal(typeof args.sections[0].heading, 'string')
  assert.equal(typeof args.sections[0].content, 'string')

  const completed = await client.beta.threads.runs.submitToolOutputsAndPoll(
    run.id,
    {
      thread_id: thread.id,
      tool_outputs: [{ tool_call_id: tc.id, output: fixtures.complexArgsToolOutput }],
    },
  )
  assert.equal(completed.status, 'completed')

  // Verify complex args are preserved in step
  const steps = await client.beta.threads.runs.steps.list(run.id, { thread_id: thread.id })
  const toolStep = steps.data.find(s => s.type === 'tool_calls')
  const stepArgs = JSON.parse((toolStep!.step_details as any).tool_calls[0].function.arguments)
  assert.ok(Array.isArray(stepArgs.sections))

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}

// --- Code interpreter ---

export const codeInterpreterCall: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: 'gpt-4.1-mini',
    instructions: fixtures.instructions.forceCodeInterpreter,
    tools: [fixtures.codeInterpreterTool],
  })
  const thread = await client.beta.threads.create()
  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: fixtures.prompts.codeInterpreter,
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
    tools: [fixtures.codeInterpreterTool],
  })

  assert.equal(run.status, 'completed', 'Code interpreter runs complete without requires_action')

  // Steps should have a code_interpreter step
  const steps = await client.beta.threads.runs.steps.list(run.id, { thread_id: thread.id })
  const codeStep = steps.data.find(s =>
    s.type === 'tool_calls' &&
    (s.step_details as any).tool_calls?.some((tc: any) => tc.type === 'code_interpreter')
  )
  assert.ok(codeStep, `Should have code_interpreter step. Step types: ${steps.data.map(s => s.type)}`)
  assertRunStepShape(codeStep!, 'code_interpreter step')

  const codeCall = (codeStep!.step_details as any).tool_calls.find(
    (tc: any) => tc.type === 'code_interpreter'
  )
  assert.ok(codeCall.code_interpreter, 'Should have code_interpreter details')
  assert.equal(typeof codeCall.code_interpreter.input, 'string', 'Should have code input')
  assert.ok(Array.isArray(codeCall.code_interpreter.outputs), 'Should have outputs array')

  const logsOutput = codeCall.code_interpreter.outputs.find((o: any) => o.type === 'logs')
  assert.ok(logsOutput, 'Should have logs output')
  assert.ok(logsOutput.logs.includes('5050'), 'sum(1..100) = 5050')

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}

// --- Multiple rounds of tool calls ---

export const multipleToolCallRounds: Contract = async (client) => {
  const assistant = await client.beta.assistants.create({
    model: 'gpt-4.1-mini',
    instructions: 'You MUST call get_weather for EACH city separately. Call for the first city, get the result, then call for the second city.',
    tools: [fixtures.weatherTool],
  })
  const thread = await client.beta.threads.create()
  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is the weather in Tokyo? After you get that, also check London. Call the tool separately for each.',
  })

  let run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
    tools: [fixtures.weatherTool],
  })

  assert.equal(run.status, 'requires_action')
  let tc = run.required_action!.submit_tool_outputs.tool_calls[0]
  assert.equal(tc.function.name, 'get_weather')

  run = await client.beta.threads.runs.submitToolOutputsAndPoll(
    run.id,
    {
      thread_id: thread.id,
      tool_outputs: [{
        tool_call_id: tc.id,
        output: JSON.stringify({ temperature: 25, unit: 'C', conditions: 'clear' }),
      }],
    },
  )

  // Model might call again for the second city, or might complete
  if (run.status === 'requires_action') {
    tc = run.required_action!.submit_tool_outputs.tool_calls[0]
    assert.equal(tc.function.name, 'get_weather')

    run = await client.beta.threads.runs.submitToolOutputsAndPoll(
      run.id,
      {
        thread_id: thread.id,
        tool_outputs: [{
          tool_call_id: tc.id,
          output: JSON.stringify({ temperature: 15, unit: 'C', conditions: 'rainy' }),
        }],
      },
    )
  }

  assert.equal(run.status, 'completed')

  const steps = await client.beta.threads.runs.steps.list(run.id, { thread_id: thread.id })
  const toolSteps = steps.data.filter(s => s.type === 'tool_calls')
  assert.ok(toolSteps.length >= 1, 'Should have at least 1 tool_calls step')

  for (const step of toolSteps) {
    assert.equal(step.status, 'completed')
    for (const call of (step.step_details as any).tool_calls) {
      assert.ok(call.function.output, `Tool call ${call.function.name} should have output`)
    }
  }

  await cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}
