import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import OpenAI from 'openai'
import { completionsRunAdapter } from '../src/index'

test('completions run adapter still requires outputs for web_search function on non-Anthropic models', async () => {
  const adapter = completionsRunAdapter()

  const events: OpenAI.Beta.AssistantStreamEvent[] = []

  const providerResponse = (async function* () {
    yield {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'web_search',
                  arguments: '{"query":"hello"}',
                },
              },
            ],
          },
        },
      ],
    }
  })()

  const client = {
    chat: {
      completions: {
        create: async () => providerResponse,
      },
    },
  } as unknown as OpenAI

  const run = {
    id: 'run_123',
    assistant_id: 'asst_123',
    thread_id: 'thread_123',
    status: 'queued',
    model: 'gpt-4o-mini',
    instructions: null,
    created_at: Date.now() / 1000,
    expires_at: null,
    started_at: null,
    cancelled_at: null,
    cancelled_by: null,
    failed_at: null,
    completed_at: null,
    last_error: null,
    max_completion_tokens: null,
    max_prompt_tokens: null,
    metadata: {},
    response_format: null,
    temperature: null,
    tool_choice: 'auto',
    top_p: null,
    truncation_strategy: { type: 'last_messages', last_messages: null },
    run_type: 'default',
    usage: null,
    required_action: null,
    parallel_tool_calls: true,
    tools: [
      {
        type: 'function',
        function: {
          name: 'web_search',
          description: 'Searches the web.',
          parameters: { type: 'object' },
        },
      },
    ],
  } as unknown as OpenAI.Beta.Threads.Run

  const onEvent = async (event: OpenAI.Beta.AssistantStreamEvent) => {
    events.push(event)

    if (event.event === 'thread.message.completed') {
      return {
        ...event.data,
        toolCalls: event.data.tool_calls,
      }
    }

    return event.data
  }

  await adapter.handleRun({
    client,
    run,
    onEvent,
    getMessages: async () => [],
  })

  const requiresActionEvent = events.find(
    (event) => event.event === 'thread.run.requires_action'
  )

  assert.ok(requiresActionEvent)

  const toolCalls =
    requiresActionEvent!.data.required_action?.submit_tool_outputs.tool_calls
  assert.ok(toolCalls)
  assert.equal(toolCalls.length, 1)
  assert.equal(toolCalls[0].function.name, 'web_search')
})

test('completions run adapter still requires outputs for code_execution function on non-Anthropic models', async () => {
  const adapter = completionsRunAdapter()

  const events: OpenAI.Beta.AssistantStreamEvent[] = []

  const providerResponse = (async function* () {
    yield {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'code_execution',
                  arguments: '{"code":"print(2 + 2)"}',
                },
              },
            ],
          },
        },
      ],
    }
  })()

  const client = {
    chat: {
      completions: {
        create: async () => providerResponse,
      },
    },
  } as unknown as OpenAI

  const run = {
    id: 'run_789',
    assistant_id: 'asst_789',
    thread_id: 'thread_789',
    status: 'queued',
    model: 'gpt-4o-mini',
    instructions: null,
    created_at: Date.now() / 1000,
    expires_at: null,
    started_at: null,
    cancelled_at: null,
    cancelled_by: null,
    failed_at: null,
    completed_at: null,
    last_error: null,
    max_completion_tokens: null,
    max_prompt_tokens: null,
    metadata: {},
    response_format: null,
    temperature: null,
    tool_choice: 'auto',
    top_p: null,
    truncation_strategy: { type: 'last_messages', last_messages: null },
    run_type: 'default',
    usage: null,
    required_action: null,
    parallel_tool_calls: true,
    tools: [
      {
        type: 'function',
        function: {
          name: 'code_execution',
          description: 'Executes code.',
          parameters: { type: 'object' },
        },
      },
    ],
  } as unknown as OpenAI.Beta.Threads.Run

  const onEvent = async (event: OpenAI.Beta.AssistantStreamEvent) => {
    events.push(event)

    if (event.event === 'thread.message.completed') {
      return {
        ...event.data,
        toolCalls: event.data.tool_calls,
      }
    }

    return event.data
  }

  await adapter.handleRun({
    client,
    run,
    onEvent,
    getMessages: async () => [],
  })

  const requiresActionEvent = events.find(
    (event) => event.event === 'thread.run.requires_action'
  )

  assert.ok(requiresActionEvent)

  const toolCalls =
    requiresActionEvent!.data.required_action?.submit_tool_outputs.tool_calls
  assert.ok(toolCalls)
  assert.equal(toolCalls.length, 1)
  assert.equal(toolCalls[0].function.name, 'code_execution')
})

test('completions run adapter still requires outputs for computer function on non-Anthropic models', async () => {
  const adapter = completionsRunAdapter()

  const events: OpenAI.Beta.AssistantStreamEvent[] = []

  const providerResponse = (async function* () {
    yield {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'computer',
                  arguments: '{"cursor":{"x":10,"y":20}}',
                },
              },
            ],
          },
        },
      ],
    }
  })()

  const client = {
    chat: {
      completions: {
        create: async () => providerResponse,
      },
    },
  } as unknown as OpenAI

  const run = {
    id: 'run_987',
    assistant_id: 'asst_987',
    thread_id: 'thread_987',
    status: 'queued',
    model: 'gpt-4o-mini',
    instructions: null,
    created_at: Date.now() / 1000,
    expires_at: null,
    started_at: null,
    cancelled_at: null,
    cancelled_by: null,
    failed_at: null,
    completed_at: null,
    last_error: null,
    max_completion_tokens: null,
    max_prompt_tokens: null,
    metadata: {},
    response_format: null,
    temperature: null,
    tool_choice: 'auto',
    top_p: null,
    truncation_strategy: { type: 'last_messages', last_messages: null },
    run_type: 'default',
    usage: null,
    required_action: null,
    parallel_tool_calls: true,
    tools: [
      {
        type: 'function',
        function: {
          name: 'computer',
          description: 'Controls a remote computer.',
          parameters: { type: 'object' },
        },
      },
    ],
  } as unknown as OpenAI.Beta.Threads.Run

  const onEvent = async (event: OpenAI.Beta.AssistantStreamEvent) => {
    events.push(event)

    if (event.event === 'thread.message.completed') {
      return {
        ...event.data,
        toolCalls: event.data.tool_calls,
      }
    }

    return event.data
  }

  await adapter.handleRun({
    client,
    run,
    onEvent,
    getMessages: async () => [],
  })

  const requiresActionEvent = events.find(
    (event) => event.event === 'thread.run.requires_action'
  )

  assert.ok(requiresActionEvent)

  const toolCalls =
    requiresActionEvent!.data.required_action?.submit_tool_outputs.tool_calls
  assert.ok(toolCalls)
  assert.equal(toolCalls.length, 1)
  assert.equal(toolCalls[0].type, 'function')
  assert.equal(toolCalls[0].function?.name, 'computer')
})
