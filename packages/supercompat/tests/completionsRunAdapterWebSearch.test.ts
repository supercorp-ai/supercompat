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

test('completions run adapter auto-completes Anthropics server web search tool calls', async () => {
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
                id: 'srvtoolu_123',
                type: 'function',
                function: {
                  name: 'web_search',
                  arguments: '{"query":"claude shannon"}',
                },
              },
            ],
          },
        },
      ],
    }

    yield {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'srvtoolu_123',
                type: 'function',
                function: {
                  output:
                    '{"content":[{"type":"web_search_result","title":"Claude Shannon - Wikipedia","url":"https://en.wikipedia.org/wiki/Claude_Shannon"}]}',
                },
              },
            ],
          },
        },
      ],
    }

    yield {
      choices: [
        {
          delta: {
            content: 'Claude Shannon was born on April 30, 1916.',
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
    id: 'run_456',
    assistant_id: 'asst_456',
    thread_id: 'thread_456',
    status: 'queued',
    model: 'claude-haiku-4-5-20251001',
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
        type: 'web_search_20250305',
        web_search_20250305: {
          name: 'web_search',
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
  assert.equal(requiresActionEvent, undefined)

  const completedEvent = events.find(
    (event) => event.event === 'thread.run.completed'
  )
  assert.ok(completedEvent)

  const messageCompletedEvent = events.find(
    (event) => event.event === 'thread.message.completed'
  ) as OpenAI.Beta.AssistantStreamEvent.ThreadMessageCompleted | undefined

  assert.ok(messageCompletedEvent)
  const toolCall =
    messageCompletedEvent.data.tool_calls?.[0] ??
    (messageCompletedEvent.data as any).toolCalls?.[0]
  assert.ok(toolCall)
  assert.ok(toolCall.function?.output)
  const parsedOutput = JSON.parse(toolCall.function.output!)
  assert.ok(Array.isArray(parsedOutput.content))
  const firstResult = parsedOutput.content[0] as Record<string, unknown>
  assert.equal(firstResult?.type, 'web_search_result')
})
