import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import Anthropic from '@anthropic-ai/sdk'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { ProxyAgent, setGlobalDispatcher } from 'undici'
import dns from 'node:dns'
import { anthropicClientAdapter, completionsRunAdapter, supercompat } from '../src/index'

dns.setDefaultResultOrder('ipv4first')

if (process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY))
}

const anthropicKey = process.env.ANTHROPIC_API_KEY

const createClient = () => {
  if (!anthropicKey) {
    throw new Error('ANTHROPIC_API_KEY is required for this test')
  }

  const anthropic = new Anthropic({
    apiKey: anthropicKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  return supercompat({
    client: anthropicClientAdapter({ anthropic }),
  })
}

const createUserMessage = (content: string) => ([
  {
    id: `msg_${Math.random().toString(36).slice(2)}`,
    object: 'thread.message',
    created_at: Math.floor(Date.now() / 1000),
    role: 'user',
    content: [
      {
        type: 'text',
        text: {
          value: content,
          annotations: [],
        },
      },
    ],
    run: null,
    metadata: {},
  },
] as any)

const createRunBase = (tool: { name: string; description: string }) => ({
  id: `run_${Math.random().toString(36).slice(2)}`,
  assistant_id: 'asst_placeholder',
  thread_id: 'thread_placeholder',
  status: 'queued',
  model: 'claude-sonnet-4-5',
  instructions: `Always call the ${tool.name} tool before responding and wait for tool results.`,
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
        name: tool.name,
        description: tool.description,
        parameters: { type: 'object' },
      },
    },
  ],
})

const handleRunWithAnthropic = async ({
  tool,
  userContent,
}: {
  tool: { name: string; description: string }
  userContent: string
}) => {
  const adapter = completionsRunAdapter()
  const client = createClient()
  const events: any[] = []

  const run = createRunBase(tool) as any

  const onEvent = async (event: any) => {
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
    getMessages: async () => createUserMessage(userContent),
  })

  return events
}

if (!anthropicKey) {
  test.skip('completions run adapter still requires outputs for web_search function on real Anthropics', () => {})
  test.skip('completions run adapter still requires outputs for code_execution function on real Anthropics', () => {})
  test.skip('completions run adapter still requires outputs for computer function on real Anthropics', () => {})
} else {
  test(
    'completions run adapter still requires outputs for web_search function on real Anthropics',
    { timeout: 120_000 },
    async () => {
      const events = await handleRunWithAnthropic({
        tool: {
          name: 'web_search',
          description: 'Searches the web for information.',
        },
        userContent: 'Please look up the latest technology news using the web_search tool.',
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
    }
  )

  test(
    'completions run adapter still requires outputs for code_execution function on real Anthropics',
    { timeout: 120_000 },
    async () => {
      const events = await handleRunWithAnthropic({
        tool: {
          name: 'code_execution',
          description: 'Executes code in a sandboxed environment.',
        },
        userContent: 'Run Python code to compute the first 5 Fibonacci numbers using the code_execution tool.',
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
    }
  )

  test(
    'completions run adapter still requires outputs for computer function on real Anthropics',
    { timeout: 120_000 },
    async () => {
      const events = await handleRunWithAnthropic({
        tool: {
          name: 'computer',
          description: 'Controls a remote computer by taking screenshots, clicking, typing, and more.',
        },
        userContent:
          'Use the computer tool to take a screenshot and then wait for further instructions.',
      })

      const requiresActionEvent = events.find(
        (event) => event.event === 'thread.run.requires_action'
      )

      assert.ok(requiresActionEvent)

      const toolCalls =
        requiresActionEvent!.data.required_action?.submit_tool_outputs.tool_calls
      assert.ok(toolCalls)
      assert.equal(toolCalls.length, 1)
      assert.equal(toolCalls[0].type, 'computer_call')
      assert.equal(typeof toolCalls[0].computer_call?.action, 'object')
    }
  )
}
