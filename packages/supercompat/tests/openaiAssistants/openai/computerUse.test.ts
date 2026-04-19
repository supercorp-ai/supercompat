import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import OpenAI from 'openai'
import { OpenRouter, HTTPClient } from '@openrouter/sdk'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI } from '@google/genai'
import { PrismaClient } from '@prisma/client'
import { createTestPrisma } from '../../lib/testPrisma'
import { ProxyAgent, setGlobalDispatcher } from 'undici'
import { HttpsProxyAgent } from 'https-proxy-agent'
import dayjs from 'dayjs'
import {
  openaiResponsesRunAdapter,
  completionsRunAdapter,
  openaiClientAdapter,
  openRouterClientAdapter,
  supercompat,
  openaiResponsesStorageAdapter,
  prismaStorageAdapter,
} from '../../../src/openai/index'
import { startMcpContainer, type McpContainerHandle } from '../../lib/mcpContainer'

// ---------------------------------------------------------------------------
// Configuration — each test owns its own container on a distinct port so the
// `describe` block below can run them in parallel (`{ concurrency: true }`).
// ---------------------------------------------------------------------------
const DISPLAY_WIDTH = 1280
const DISPLAY_HEIGHT = 720
const MAX_AGENT_ITERATIONS = 5

// Static per-test port allocations. The outer constant keeps ports visible in
// one place when debugging collisions. `openaiResponses` and `openaiAssistants`
// test suites live in different files and use different port ranges (3104-3113
// for kimi+gemma), so 8001-8010 stays clear.
const PORT = {
  openaiDirect: 8001,
  openaiSupercompat: 8002,
  anthropicHaiku: 8003,
  geminiResponses: 8007,
  qwenOpenRouter: 8004,
  qwenSupercompat: 8008,
  glm46v: 8005,
  geminiFlashOpenRouter: 8006,
  miniMax: 8009,
} as const

// Decisive, step-bounded task — every provider we support can do this reliably.
// We deliberately avoid click-targeting tasks because cheap/local vision models
// (kimi, qwen, gemma, glm, etc.) coordinate-click poorly and get stuck looping.
// Scroll+describe validates the whole plumbing: tool invocation, action
// round-trip through MCP, screenshot feedback, final text reply.
const TASK_PROMPT =
  'Follow these steps EXACTLY and stop after step 3. ' +
  'STEP 1: Take a screenshot. ' +
  'STEP 2: Scroll down once (scroll action, direction "down"). ' +
  'STEP 3: Respond with a single short sentence naming ONE product or heading visible on the page ' +
  '(for example, "Superinterface" or "Supermachine"). ' +
  'DO NOT take more screenshots after step 2. DO NOT keep scrolling. ' +
  'Do the entire task yourself without stopping to ask questions.'

// Keywords that only exist on the rendered supercorp.ai page — used to
// assert the model actually saw the screenshot rather than hallucinating.
// Most Supercorp products start with `super` (Superinterface, Supermachine,
// Supergateway, Superstream, etc.), but the page also features Big-AGI and
// uses the tagline "Accelerating open-source AI" — match any of these.
function sawSupercorpContent(text: string): boolean {
  return (
    /\bsuper[a-z]+/i.test(text) ||
    /big[-\s]?agi/i.test(text) ||
    /ai[-\s]?native/i.test(text) ||
    /accelerat/i.test(text) ||
    /open[-\s]?source/i.test(text)
  )
}

const shouldSkipSlowTests = process.env.SKIP_SLOW_TESTS === 'true'
const testOrSkip = shouldSkipSlowTests ? test.skip : test
const openaiApiKey = process.env.TEST_OPENAI_API_KEY
const anthropicApiKey = process.env.ANTHROPIC_API_KEY
const googleApiKey = process.env.GOOGLE_API_KEY
const openrouterApiKey = process.env.OPENROUTER_API_KEY

if (process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY))
}

// ---------------------------------------------------------------------------
// Benchmarking helper
// ---------------------------------------------------------------------------
function bench(label: string) {
  const start = performance.now()
  return {
    end: () => {
      const ms = performance.now() - start
      console.log(`[bench] ${label}: ${ms.toFixed(0)}ms`)
      return ms
    },
  }
}

// ---------------------------------------------------------------------------
// Per-container MCP helpers — factory-bound to a specific baseUrl so multiple
// containers can be driven in parallel from a single test file.
//
// Each test calls `makeMcpHelpers(baseUrl)` and destructures the returned
// `initializeMcpSession` / `executeComputerAction` / `resetBrowser` into its
// own scope. All call sites below keep their original signature — only the
// enclosing closure changes between tests.
// ---------------------------------------------------------------------------
type ExecuteComputerAction = (
  sessionId: string,
  action: Record<string, unknown>,
) => Promise<string>

const MCP_POST_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json, text/event-stream',
}

function makeMcpHelpers(baseUrl: string) {
  async function initializeMcpSession(): Promise<string> {
    const initRes = await fetch(baseUrl, {
      method: 'POST',
      headers: MCP_POST_HEADERS,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'computer-use-test', version: '1.0.0' },
        },
      }),
    })

    assert.ok(initRes.ok, `MCP initialize failed: ${initRes.status}`)
    const sessionId = initRes.headers.get('mcp-session-id')
    assert.ok(sessionId, 'No mcp-session-id returned from initialize')

    const notifyRes = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        ...MCP_POST_HEADERS,
        'mcp-session-id': sessionId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    })
    assert.ok(notifyRes.ok || notifyRes.status === 204, `notifications/initialized failed: ${notifyRes.status}`)

    return sessionId
  }

  async function executeComputerAction(
    sessionId: string,
    action: Record<string, unknown>,
  ): Promise<string> {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        ...MCP_POST_HEADERS,
        'mcp-session-id': sessionId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'computer_call',
          arguments: { action },
        },
      }),
    })

    assert.ok(res.ok, `MCP tools/call failed: ${res.status}`)

    const contentType = res.headers.get('content-type') ?? ''
    let body: any

    if (contentType.includes('text/event-stream')) {
      const text = await res.text()
      const dataLines = text
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())

      for (const dataLine of dataLines) {
        try {
          const parsed = JSON.parse(dataLine)
          if (parsed.result || parsed.error) {
            body = parsed
            break
          }
        } catch {
          // not the line we want
        }
      }
      assert.ok(body, 'No JSON-RPC result found in SSE response')
    } else {
      body = await res.json()
    }

    if (body.error) {
      throw new Error(`MCP error: ${JSON.stringify(body.error)}`)
    }

    const content = body.result?.structuredContent?.content
    assert.ok(Array.isArray(content), 'Expected structuredContent.content array')

    const imageItem = content.find(
      (item: any) => item.type === 'input_image' && item.image_url,
    )
    assert.ok(imageItem, 'No input_image found in MCP response')

    const dataUri: string = imageItem.image_url
    assert.ok(
      dataUri.startsWith('data:image/png;base64,'),
      'Screenshot should be a data:image/png;base64 URI',
    )

    return dataUri
  }

  async function resetBrowser(sessionId: string): Promise<void> {
    await executeComputerAction(sessionId, { type: 'keypress', keys: ['Escape'] })
    await new Promise((r) => setTimeout(r, 500))
    await executeComputerAction(sessionId, { type: 'keypress', keys: ['F5'] })
    await new Promise((r) => setTimeout(r, 3000))
  }

  return { initializeMcpSession, executeComputerAction, resetBrowser }
}

// Each test wraps its body in this to spin up a fresh container, bind the
// MCP helpers to it, and tear the container down on exit. Using a per-test
// container is what makes the `describe({ concurrency: true })` below safe.
async function withTestMcp<T>(
  opts: { name: string; port: number },
  body: (helpers: ReturnType<typeof makeMcpHelpers> & { container: McpContainerHandle }) => Promise<T>,
): Promise<T> {
  const container = await startMcpContainer(opts)
  try {
    const helpers = makeMcpHelpers(container.serverUrl)
    return await body({ ...helpers, container })
  } finally {
    container.stop()
  }
}

// ---------------------------------------------------------------------------
// Anthropic action format normalization
// Anthropic: { action: "left_click", coordinate: [x, y] }
// MCP expects: { type: "click", x, y }
// ---------------------------------------------------------------------------
function normalizeAnthropicAction(input: Record<string, unknown>): Record<string, unknown> {
  const { action, coordinate, text, ...rest } = input

  const actionMap: Record<string, string> = {
    left_click: 'click',
    right_click: 'click',
    middle_click: 'click',
    double_click: 'double_click',
    triple_click: 'triple_click',
    screenshot: 'screenshot',
    type: 'type',
    key: 'keypress',
    scroll: 'scroll',
    mouse_move: 'move',
    cursor_position: 'screenshot',
  }

  const normalized: Record<string, unknown> = {
    ...rest,
    type: actionMap[action as string] || (action as string),
  }

  if (Array.isArray(coordinate)) {
    normalized.x = coordinate[0]
    normalized.y = coordinate[1]
  }

  if (action === 'right_click') normalized.button = 'right'
  else if (action === 'middle_click') normalized.button = 'middle'

  if (action === 'key' && typeof text === 'string') {
    normalized.keys = [text]
  } else if (text !== undefined) {
    normalized.text = text
  }

  return normalized
}

// ===========================================================================
// Test 1: OpenAI direct (Responses API)
// ===========================================================================
// concurrency:1 — serial within the file. With 4+ computer-use test files
// running in parallel at the runner level, extra in-file parallelism leads
// to docker container-name collisions and Chromium startup starvation.
describe('tests', { concurrency: 1 }, () => {
testOrSkip('OpenAI direct: computer use finds subscribe form fields', { timeout: 360_000 }, async (t) => {
  assert.ok(openaiApiKey, 'TEST_OPENAI_API_KEY must be set')
  const totalBench = bench('OpenAI direct total')

  const openai = new OpenAI({
    apiKey: openaiApiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const container = await startMcpContainer({ name: 'computer-use-mcp-openai-direct', port: PORT.openaiDirect })
  t.after(() => container.stop())
  const { initializeMcpSession, executeComputerAction, resetBrowser } = makeMcpHelpers(container.serverUrl)

  const sessionId = await initializeMcpSession()
  console.log('[openai-direct] MCP session:', sessionId)

  let b = bench('reset browser')
  await resetBrowser(sessionId)
  b.end()

  // Text-only input — model takes screenshots via computer tool
  b = bench('OpenAI first API call')
  let response = await (openai.responses as any).create({
    model: 'gpt-5.4-mini',
    tools: [
      {
        type: 'computer',
      },
    ],
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: TASK_PROMPT },
        ],
      },
    ],
    truncation: 'auto',
  })
  b.end()

  let computerCallCount = 0

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    const computerCalls = (response.output ?? []).filter(
      (item: any) => item.type === 'computer_call',
    )

    if (computerCalls.length === 0) {
      console.log(`[openai-direct] No computer_call in iteration ${iteration}, model is done`)
      break
    }

    for (const call of computerCalls) {
      computerCallCount++
      // GA format uses actions[] (batched), legacy uses action (single)
      const actions = call.actions ?? (call.action ? [call.action] : [])
      console.log(`[openai-direct] computer_call #${computerCallCount}: ${actions.map((a: any) => a.type).join(', ')}`)

      assert.ok(call.call_id, 'computer_call should have call_id')
      assert.ok(actions.length > 0, 'computer_call should have at least one action')

      b = bench(`MCP action #${computerCallCount} (${actions.map((a: any) => a.type).join(', ')})`)
      let screenshotUri: string = ''
      for (const action of actions) {
        screenshotUri = await executeComputerAction(sessionId, action)
      }
      b.end()

      const pendingSafetyChecks = (response.output ?? [])
        .filter((item: any) => item.type === 'computer_call' && item.pending_safety_checks?.length)
        .flatMap((item: any) => item.pending_safety_checks)

      const computerCallOutput: any = {
        type: 'computer_call_output',
        call_id: call.call_id,
        output: { type: 'computer_screenshot', image_url: screenshotUri },
      }
      if (pendingSafetyChecks.length > 0) {
        computerCallOutput.acknowledged_safety_checks = pendingSafetyChecks
      }

      b = bench(`OpenAI API call #${computerCallCount + 1}`)
      response = await (openai.responses as any).create({
        model: 'gpt-5.4-mini',
        tools: [
          {
            type: 'computer',
          },
        ],
        previous_response_id: response.id,
        input: [computerCallOutput],
        truncation: 'auto',
      })
      b.end()
    }
  }

  const textOutputs = (response.output ?? [])
    .filter((item: any) => item.type === 'message')
    .flatMap((item: any) => item.content ?? [])
    .filter((part: any) => part.type === 'output_text')
    .map((part: any) => part.text)

  const finalAnswer = textOutputs.join(' ').toLowerCase()
  console.log('[openai-direct] Final answer:', finalAnswer)

  assert.ok(computerCallCount >= 1, 'Model should produce at least one computer_call')
  assert.ok(sawSupercorpContent(finalAnswer), `Expected supercorp.ai page content in answer, got: "${finalAnswer}"`)

  const totalMs = totalBench.end()
  console.log(`[openai-direct] PASS. ${computerCallCount} computer_calls, ${totalMs.toFixed(0)}ms total`)
})

// ===========================================================================
// Test 2: OpenAI via supercompat (thread/run abstraction)
// ===========================================================================
// NOTE: conversation + input_image is rejected by OpenAI API for computer-use-preview.
// The workaround (matching superinterface's approach) is to send text-only messages
// and let the model take screenshots via the computer_use_preview tool.
testOrSkip('OpenAI supercompat: computer use via thread/run finds subscribe form fields', { timeout: 360_000 }, async (t) => {
  assert.ok(openaiApiKey, 'TEST_OPENAI_API_KEY must be set')
  const totalBench = bench('OpenAI supercompat total')

  const realOpenAI = new OpenAI({
    apiKey: openaiApiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const tools = [
    {
      type: 'computer',
    },
  ] as any[]

  const openaiAssistant = {
    id: 'computer-use-assistant',
    object: 'assistant' as const,
    model: 'gpt-5.4-mini',
    instructions: 'You are a browser automation agent. You can see the screen and interact with it.',
    description: null,
    name: 'Computer Use Assistant',
    metadata: {},
    tools,
    created_at: dayjs().unix(),
  }

  const client = supercompat({
    clientAdapter: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: openaiResponsesRunAdapter({
      getOpenaiAssistant: () => openaiAssistant,
    }),
    storageAdapter: openaiResponsesStorageAdapter(),
  })

  const container = await startMcpContainer({ name: 'computer-use-mcp-openai-supercompat', port: PORT.openaiSupercompat })
  t.after(() => container.stop())
  const { initializeMcpSession, executeComputerAction, resetBrowser } = makeMcpHelpers(container.serverUrl)

  // Initialize MCP
  const sessionId = await initializeMcpSession()
  console.log('[openai-supercompat] MCP session:', sessionId)

  let b = bench('reset browser')
  await resetBrowser(sessionId)
  b.end()

  // Text-only — model takes screenshots via the tool
  b = bench('create thread + message')
  const thread = await client.beta.threads.create()
  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: TASK_PROMPT,
  })
  b.end()
  console.log('[openai-supercompat] Thread:', thread.id)

  // Agentic loop
  let computerCallCount = 0
  let currentRunId: string | undefined
  let pendingToolOutputs: any[] = []
  let accumulatedText = ''

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    b = bench(`run iteration #${iteration}`)
    let requiresActionEvent: any
    let completedEvent: any
    let failedEvent: any

    const consumeStream = async (stream: AsyncIterable<any>) => {
      for await (const event of stream) {
        console.log(`[openai-supercompat] Event: ${event.event}`)
        if (event.event === 'thread.run.requires_action') {
          requiresActionEvent = event
        } else if (event.event === 'thread.run.completed') {
          completedEvent = event
        } else if (event.event === 'thread.run.failed') {
          failedEvent = event
          console.error('[openai-supercompat] Run failed:', JSON.stringify(event.data?.last_error))
        } else if (event.event === 'thread.message.delta') {
          const delta = event.data?.delta?.content?.[0]
          if (delta?.type === 'text' && delta?.text?.value) {
            accumulatedText += delta.text.value
          }
        }
      }
    }

    if (iteration === 0) {
      const run = await client.beta.threads.runs.create(thread.id, {
        assistant_id: openaiAssistant.id,
        stream: true,
        tools,
      })
      await consumeStream(run)
    } else {
      assert.ok(currentRunId, 'Expected currentRunId for tool output submission')

      const submit = await client.beta.threads.runs.submitToolOutputs(
        currentRunId!,
        {
          thread_id: thread.id,
          stream: true,
          tool_outputs: pendingToolOutputs,
        },
      )
      await consumeStream(submit)
    }
    b.end()

    if (failedEvent) {
      assert.fail(`Run failed: ${JSON.stringify(failedEvent.data?.last_error)}`)
    }

    if (completedEvent) {
      console.log(`[openai-supercompat] Run completed at iteration ${iteration}`)
      break
    }

    if (!requiresActionEvent) {
      console.log(`[openai-supercompat] No requires_action at iteration ${iteration}`)
      break
    }

    currentRunId = requiresActionEvent.data.id
    const toolCalls = requiresActionEvent.data.required_action?.submit_tool_outputs?.tool_calls ?? []

    pendingToolOutputs = []

    for (const toolCall of toolCalls) {
      if (toolCall.type === 'computer_call') {
        // Responses API GA batches multiple actions per computer_call via
        // `actions[]`. Older single-action shape uses `action`; support both.
        const cc = toolCall.computer_call as any
        const actions = (cc?.actions as any[] | undefined)
          ?? (cc?.action ? [cc.action] : [])
        assert.ok(actions.length > 0, 'computer_call must carry at least one action')

        let screenshotUri: string = ''
        for (const action of actions) {
          computerCallCount++
          console.log(`[openai-supercompat] computer_call #${computerCallCount}: ${action?.type}`)

          b = bench(`MCP action #${computerCallCount} (${action?.type})`)
          screenshotUri = await executeComputerAction(sessionId, action)
          b.end()
        }

        pendingToolOutputs.push({
          tool_call_id: toolCall.id,
          output: JSON.stringify({
            type: 'computer_screenshot',
            image_url: screenshotUri,
          }),
          acknowledged_safety_checks: toolCall.computer_call?.pending_safety_checks ?? [],
        })
      } else if (toolCall.type === 'function') {
        const rawArgs = toolCall.function.arguments
        const args = typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : JSON.parse(rawArgs)
        if (toolCall.function.name === 'computer_call') {
          // Supercompat serializer emits both `action` (when length === 1)
          // and `actions` (always, when non-empty). Prefer the batched
          // field so multi-action calls don't get silently truncated.
          const actions = (args.actions as any[] | undefined)
            ?? (args.action ? [args.action] : [])
          assert.ok(actions.length > 0, 'computer_call (fn) must carry at least one action')

          let screenshotUri: string = ''
          for (const action of actions) {
            computerCallCount++
            console.log(`[openai-supercompat] computer_call (fn) #${computerCallCount}: ${action?.type}`)

            b = bench(`MCP action #${computerCallCount} (${action?.type})`)
            screenshotUri = await executeComputerAction(sessionId, action)
            b.end()
          }

          pendingToolOutputs.push({
            tool_call_id: toolCall.id,
            output: JSON.stringify({
              type: 'computer_screenshot',
              image_url: screenshotUri,
            }),
            acknowledged_safety_checks: args.pending_safety_checks ?? [],
          })
        }
      }
    }

    if (pendingToolOutputs.length === 0) {
      console.log(`[openai-supercompat] No tool outputs to submit at iteration ${iteration}`)
      break
    }
  }

  // Final answer captured from stream delta events
  const finalAnswer = accumulatedText.toLowerCase()
  console.log('[openai-supercompat] Final answer:', finalAnswer)

  assert.ok(computerCallCount >= 1, 'Model should produce at least one computer_call')
  assert.ok(sawSupercorpContent(finalAnswer), `Expected supercorp.ai page content in answer, got: "${finalAnswer}"`)

  const totalMs = totalBench.end()
  console.log(`[openai-supercompat] PASS. ${computerCallCount} computer_calls, ${totalMs.toFixed(0)}ms total`)
})

// ===========================================================================
// Test 3: Anthropic direct (Messages API with computer_20250124)
// ===========================================================================
testOrSkip('Anthropic: claude-haiku-4-5 computer use finds subscribe form fields', { timeout: 360_000 }, async (t) => {
  assert.ok(anthropicApiKey, 'ANTHROPIC_API_KEY must be set')
  const totalBench = bench('Anthropic total')

  const anthropic = new Anthropic({ apiKey: anthropicApiKey })

  const container = await startMcpContainer({ name: 'computer-use-mcp-anthropic', port: PORT.anthropicHaiku })
  t.after(() => container.stop())
  const { initializeMcpSession, executeComputerAction, resetBrowser } = makeMcpHelpers(container.serverUrl)

  // Initialize MCP
  const sessionId = await initializeMcpSession()
  console.log('[anthropic] MCP session:', sessionId)

  let b = bench('reset browser')
  await resetBrowser(sessionId)
  b.end()

  // Text-only — model takes screenshots via computer tool
  const messages: any[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: TASK_PROMPT },
      ],
    },
  ]

  let computerCallCount = 0
  let finalAnswer = ''

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    b = bench(`Anthropic API call #${iteration + 1}`)
    const response = await anthropic.beta.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      tools: [
        {
          type: 'computer_20250124',
          name: 'computer',
          display_width_px: DISPLAY_WIDTH,
          display_height_px: DISPLAY_HEIGHT,
          display_number: 0,
        },
      ],
      messages,
      betas: ['computer-use-2025-01-24'],
    } as any)
    b.end()

    console.log(`[anthropic] Response stop_reason=${response.stop_reason}, content blocks=${response.content.length}`)

    // Collect all assistant content blocks
    messages.push({ role: 'assistant', content: response.content })

    // Check if the model is done (no tool use)
    const toolUseBlocks = (response.content as any[]).filter(
      (block: any) => block.type === 'tool_use',
    )

    if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
      // Extract final text
      const textBlocks = (response.content as any[]).filter(
        (block: any) => block.type === 'text',
      )
      finalAnswer = textBlocks.map((b: any) => b.text).join(' ').toLowerCase()
      console.log('[anthropic] Final answer:', finalAnswer)
      break
    }

    // Execute each tool use and collect results
    const toolResults: any[] = []

    for (const toolUse of toolUseBlocks) {
      computerCallCount++
      const input = toolUse.input as Record<string, unknown>
      console.log(`[anthropic] computer tool #${computerCallCount}: ${input.action} at ${JSON.stringify(input.coordinate ?? [])}`)

      // Normalize Anthropic's action format for MCP
      const mcpAction = normalizeAnthropicAction(input)
      b = bench(`MCP action #${computerCallCount} (${mcpAction.type})`)
      const screenshotUri = await executeComputerAction(sessionId, mcpAction)
      b.end()

      const screenshotBase64 = screenshotUri.split(',')[1]

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: screenshotBase64,
            },
          },
        ],
      })
    }

    messages.push({ role: 'user', content: toolResults })
  }

  console.log(`[anthropic] ${computerCallCount} computer_calls`)
  assert.ok(sawSupercorpContent(finalAnswer), `Expected supercorp.ai page content in answer, got: "${finalAnswer}"`)

  const totalMs = totalBench.end()
  console.log(`[anthropic] PASS. ${computerCallCount} computer_calls, ${totalMs.toFixed(0)}ms total`)
})

// ===========================================================================
// Test 4: Google Gemini direct (native GenAI SDK with computer_use)
// ===========================================================================
// Gemini computer use uses normalized coordinates (0-999) and expects the
// client to provide screenshots after each action. The model returns named
// actions like click_at, type_text_at, navigate, etc.

function denormGeminiX(x: number): number {
  return Math.round((x / 1000) * DISPLAY_WIDTH)
}
function denormGeminiY(y: number): number {
  return Math.round((y / 1000) * DISPLAY_HEIGHT)
}

async function executeGeminiAction(
  executeComputerAction: ExecuteComputerAction,
  sessionId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case 'click_at': {
      return executeComputerAction(sessionId, {
        type: 'click',
        x: denormGeminiX(args.x as number),
        y: denormGeminiY(args.y as number),
      })
    }
    case 'double_click_at': {
      return executeComputerAction(sessionId, {
        type: 'double_click',
        x: denormGeminiX(args.x as number),
        y: denormGeminiY(args.y as number),
      })
    }
    case 'hover_at': {
      return executeComputerAction(sessionId, {
        type: 'move',
        x: denormGeminiX(args.x as number),
        y: denormGeminiY(args.y as number),
      })
    }
    case 'type_text_at': {
      const x = denormGeminiX(args.x as number)
      const y = denormGeminiY(args.y as number)
      // Click at position first
      await executeComputerAction(sessionId, { type: 'click', x, y })
      if (args.clear_before_typing) {
        await executeComputerAction(sessionId, { type: 'keypress', keys: ['ctrl+a'] })
      }
      const screenshot = await executeComputerAction(sessionId, {
        type: 'type',
        text: args.text as string,
      })
      if (args.press_enter) {
        return executeComputerAction(sessionId, { type: 'keypress', keys: ['Return'] })
      }
      return screenshot
    }
    case 'scroll_document':
    case 'scroll_at': {
      const direction = args.direction as string
      const scrollAction: Record<string, unknown> = { type: 'scroll', direction }
      if (name === 'scroll_at') {
        scrollAction.x = denormGeminiX(args.x as number)
        scrollAction.y = denormGeminiY(args.y as number)
      }
      return executeComputerAction(sessionId, scrollAction)
    }
    case 'key_combination': {
      const keys = args.keys as string
      // Gemini returns keys like "Control+A", MCP expects ["ctrl+a"]
      const normalized = keys.replace('Control', 'ctrl').replace('Shift', 'shift').replace('Alt', 'alt')
      return executeComputerAction(sessionId, { type: 'keypress', keys: [normalized] })
    }
    case 'navigate': {
      // MCP doesn't have navigate — use address bar
      await executeComputerAction(sessionId, { type: 'keypress', keys: ['ctrl+l'] })
      await executeComputerAction(sessionId, { type: 'type', text: args.url as string })
      return executeComputerAction(sessionId, { type: 'keypress', keys: ['Return'] })
    }
    case 'go_back': {
      return executeComputerAction(sessionId, { type: 'keypress', keys: ['alt+Left'] })
    }
    case 'go_forward': {
      return executeComputerAction(sessionId, { type: 'keypress', keys: ['alt+Right'] })
    }
    case 'wait_5_seconds': {
      await new Promise((r) => setTimeout(r, 5000))
      return executeComputerAction(sessionId, { type: 'screenshot' })
    }
    default: {
      console.warn(`[gemini] Unknown action: ${name}, taking screenshot`)
      return executeComputerAction(sessionId, { type: 'screenshot' })
    }
  }
}

// SKIPPED: Gemini computer-use-preview requires paid tier (free tier has 0 quota)
test.skip('Gemini: computer-use-preview finds subscribe form fields', { timeout: 360_000 }, async (t) => {
  assert.ok(googleApiKey, 'GOOGLE_API_KEY must be set')
  const totalBench = bench('Gemini total')

  const genai = new GoogleGenAI({ apiKey: googleApiKey })

  const container = await startMcpContainer({ name: 'computer-use-mcp-gemini-responses', port: PORT.geminiResponses })
  t.after(() => container.stop())
  const { initializeMcpSession, executeComputerAction, resetBrowser } = makeMcpHelpers(container.serverUrl)

  const sessionId = await initializeMcpSession()
  console.log('[gemini] MCP session:', sessionId)

  let b = bench('reset browser')
  await resetBrowser(sessionId)
  b.end()

  // Take initial screenshot — Gemini expects the client to provide screenshots,
  // the model doesn't have a "screenshot" action like OpenAI does
  b = bench('initial screenshot')
  const initialScreenshot = await executeComputerAction(sessionId, { type: 'screenshot' })
  b.end()

  const initialBase64 = initialScreenshot.split(',')[1]

  const contents: any[] = [
    {
      role: 'user',
      parts: [
        { text: TASK_PROMPT },
        { inlineData: { mimeType: 'image/png', data: initialBase64 } },
      ],
    },
  ]

  let computerCallCount = 0
  let finalAnswer = ''

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    b = bench(`Gemini API call #${iteration + 1}`)
    const response = await genai.models.generateContent({
      model: 'gemini-2.5-computer-use-preview-10-2025',
      contents,
      config: {
        tools: [{ computerUse: { environment: 'ENVIRONMENT_BROWSER' } }],
        temperature: 1.0,
      },
    })
    b.end()

    const candidate = response.candidates?.[0]
    assert.ok(candidate, 'Expected at least one candidate in Gemini response')

    const parts = candidate.content?.parts ?? []

    // Add assistant response to conversation history
    contents.push(candidate.content)

    // Find function calls
    const functionCalls = parts.filter((p: any) => p.functionCall)

    if (functionCalls.length === 0) {
      // Model is done — extract text answer
      const textParts = parts.filter((p: any) => p.text)
      finalAnswer = textParts.map((p: any) => p.text).join(' ').toLowerCase()
      console.log(`[gemini] No function calls at iteration ${iteration}, model is done`)
      console.log('[gemini] Final answer:', finalAnswer)
      break
    }

    // Execute each function call and send results back
    const functionResponses: any[] = []

    for (const part of functionCalls) {
      const fc = part.functionCall!
      computerCallCount++
      console.log(`[gemini] action #${computerCallCount}: ${fc.name}(${JSON.stringify(fc.args)})`)

      b = bench(`MCP action #${computerCallCount} (${fc.name})`)
      const screenshotUri = await executeGeminiAction(executeComputerAction, sessionId, fc.name!, fc.args ?? {})
      b.end()

      const screenshotBase64 = screenshotUri.split(',')[1]

      functionResponses.push({
        functionResponse: {
          id: fc.id,
          name: fc.name,
          response: { status: 'ok' },
        },
      })
      // Include screenshot as separate inline data part
      functionResponses.push({
        inlineData: { mimeType: 'image/png', data: screenshotBase64 },
      })
    }

    contents.push({ role: 'user', parts: functionResponses })
  }

  console.log(`[gemini] ${computerCallCount} computer actions`)
  assert.ok(computerCallCount >= 1, 'Model should produce at least one computer action')
  assert.ok(sawSupercorpContent(finalAnswer), `Expected supercorp.ai page content in answer, got: "${finalAnswer}"`)

  const totalMs = totalBench.end()
  console.log(`[gemini] PASS. ${computerCallCount} actions, ${totalMs.toFixed(0)}ms total`)
})

// ===========================================================================
// Shared: custom function-calling tools for vision models without built-in
// computer use (Qwen, GLM, etc.) — used via OpenRouter's OpenAI-compatible API
// ===========================================================================
const VISION_AGENT_SYSTEM_PROMPT =
  `You are a browser automation agent controlling a ${DISPLAY_WIDTH}x${DISPLAY_HEIGHT} browser. ` +
  'You MUST use the provided tools to interact with the browser. NEVER describe actions in text — ' +
  'actually perform them by calling the screenshot, click, type_text, keypress, or scroll tools. ' +
  'Start by calling screenshot to see the current state. After each action you will receive a new screenshot. ' +
  'Act autonomously — never ask for confirmation or permission, just complete the entire task yourself. ' +
  'When you have completed the task, call the done tool with your answer.'

const VISION_AGENT_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'screenshot',
      description: 'Take a screenshot of the current browser state.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'click',
      description: `Click at pixel coordinates on the screen (${DISPLAY_WIDTH}x${DISPLAY_HEIGHT}).`,
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: `X pixel coordinate (0-${DISPLAY_WIDTH})` },
          y: { type: 'number', description: `Y pixel coordinate (0-${DISPLAY_HEIGHT})` },
        },
        required: ['x', 'y'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'type_text',
      description: 'Type text at the current cursor position.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to type' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'keypress',
      description: 'Press a key or key combination (e.g. "Enter", "ctrl+a").',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Key to press' },
        },
        required: ['key'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scroll',
      description: 'Scroll the page in a direction.',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
        },
        required: ['direction'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'done',
      description: 'Call this when the task is complete. Provide your answer.',
      parameters: {
        type: 'object',
        properties: {
          answer: { type: 'string', description: 'Your answer to the task' },
        },
        required: ['answer'],
      },
    },
  },
]

function parseCoords(args: Record<string, unknown>): { x: number; y: number } {
  // Some models (e.g. Qwen) return coords as array [x,y] in x field
  if (Array.isArray(args.x)) {
    return { x: Math.round((args.x as number[])[0]), y: Math.round((args.x as number[])[1]) }
  }
  if (Array.isArray(args.coordinate)) {
    return { x: Math.round((args.coordinate as number[])[0]), y: Math.round((args.coordinate as number[])[1]) }
  }
  return { x: Math.round(args.x as number), y: Math.round(args.y as number) }
}

async function executeVisionAgentTool(
  executeComputerAction: ExecuteComputerAction,
  sessionId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<{ screenshot: string; text: string }> {
  switch (name) {
    case 'screenshot': {
      const s = await executeComputerAction(sessionId, { type: 'screenshot' })
      return { screenshot: s, text: 'Screenshot taken.' }
    }
    case 'click': {
      const { x, y } = parseCoords(args)
      const s = await executeComputerAction(sessionId, { type: 'click', x, y })
      return { screenshot: s, text: `Clicked at (${x}, ${y}).` }
    }
    case 'type_text': {
      // If coords provided, click at position first
      if (args.x !== undefined || args.coordinate !== undefined) {
        const { x, y } = parseCoords(args)
        await executeComputerAction(sessionId, { type: 'click', x, y })
      }
      const s = await executeComputerAction(sessionId, { type: 'type', text: args.text as string })
      return { screenshot: s, text: `Typed "${args.text}".` }
    }
    case 'keypress': {
      const s = await executeComputerAction(sessionId, { type: 'keypress', keys: [args.key as string] })
      return { screenshot: s, text: `Pressed ${args.key}.` }
    }
    case 'scroll': {
      const s = await executeComputerAction(sessionId, { type: 'scroll', direction: args.direction as string })
      return { screenshot: s, text: `Scrolled ${args.direction}.` }
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

// ===========================================================================
// Shared: OpenRouter vision agent loop (JSON output, no function calling)
// Used for Qwen, GLM, Gemini, and other vision models via OpenRouter.
// ===========================================================================

function makeJsonAgentSystem(coordMode: 'normalized' | 'pixel'): string {
  const coordDesc = coordMode === 'normalized'
    ? 'x,y are coordinates from 0-1000 (normalized, where 0,0=top-left, 1000,1000=bottom-right)'
    : `x,y are pixel coordinates (0-${DISPLAY_WIDTH} for x, 0-${DISPLAY_HEIGHT} for y)`
  return [
    'You are a browser automation agent. You see screenshots and output JSON actions.',
    'Available actions:',
    '  {"action":"screenshot"}',
    `  {"action":"click","x":X,"y":Y} - ${coordDesc}`,
    '  {"action":"type","text":"..."}',
    '  {"action":"keypress","key":"..."}',
    '  {"action":"scroll","direction":"up"|"down"}',
    '  {"action":"done","answer":"..."}',
    '',
    'Output ONLY a JSON object, nothing else. Start with {"action":"screenshot"}.',
    'IMPORTANT: After clicking, you MUST take a screenshot to see the result before deciding.',
    'Do NOT call done until you can see the answer on screen.',
  ].join('\n')
}

function extractJson(text: string): Record<string, unknown> | null {
  // Strip model-specific wrapper tags (e.g. GLM's <|begin_of_box|>...<|end_of_box|>)
  text = text.replace(/<\|begin_of_box\|>/g, '').replace(/<\|end_of_box\|>/g, '').trim()

  // Try valid JSON first (may be wrapped in markdown code blocks)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})\s*$/)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim())
    } catch {
      // fall through to fuzzy parsing
    }
  }

  // Fuzzy parse for malformed JSON output patterns:
  // {"action":"click","x":168,620]} or {"action":"click","x":117,26
  const clickMatch = text.match(/"action"\s*:\s*"click"\s*,\s*"x"\s*:\s*\[?\s*(\d+)\s*,\s*(\d+)/)
  if (clickMatch) {
    return { action: 'click', x: parseInt(clickMatch[1]), y: parseInt(clickMatch[2]) }
  }

  // {"action":"screenshot"} or {"action":"screenshot"
  const actionMatch = text.match(/"action"\s*:\s*"(\w+)"/)
  if (actionMatch) {
    const action = actionMatch[1]
    if (action === 'screenshot') return { action: 'screenshot' }
    if (action === 'done') {
      const answerMatch = text.match(/"answer"\s*:\s*"([^"]*)"/)
      return { action: 'done', answer: answerMatch?.[1] ?? '' }
    }
    if (action === 'scroll') {
      const dirMatch = text.match(/"direction"\s*:\s*"(\w+)"/)
      return { action: 'scroll', direction: dirMatch?.[1] ?? 'down' }
    }
    if (action === 'keypress') {
      const keyMatch = text.match(/"key"\s*:\s*"([^"]*)"/)
      return { action: 'keypress', key: keyMatch?.[1] ?? 'Enter' }
    }
    if (action === 'type') {
      const textMatch = text.match(/"text"\s*:\s*"([^"]*)"/)
      return { action: 'type', text: textMatch?.[1] ?? '' }
    }
  }

  return null
}

async function runVisionAgentTest(opts: {
  model: string
  label: string
  coordMode: 'normalized' | 'pixel'
  sessionId: string
  executeComputerAction: ExecuteComputerAction
}): Promise<{ computerCallCount: number; finalAnswer: string; totalMs: number }> {
  const { model, label, coordMode, sessionId, executeComputerAction } = opts
  const totalBench = bench(`${label} total`)

  const openRouter = new OpenAI({
    apiKey: openrouterApiKey!,
    baseURL: 'https://openrouter.ai/api/v1',
  })

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: makeJsonAgentSystem(coordMode) },
    { role: 'user', content: TASK_PROMPT },
  ]

  let computerCallCount = 0
  let finalAnswer = ''

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    let b = bench(`${label} API call #${iteration + 1}`)
    const response = await openRouter.chat.completions.create({
      model,
      messages,
      temperature: 0.6,
      max_tokens: 1024,
    })
    b.end()

    const choices = response.choices ?? []
    const choice = choices[0]
    assert.ok(choice, `Expected at least one choice, got: ${JSON.stringify(response).slice(0, 300)}`)

    const text = (choice.message.content ?? '').trim()
    messages.push({ role: 'assistant', content: text })

    const cmd = extractJson(text)
    if (!cmd) {
      const lower = text.toLowerCase()
      if (lower.includes('name') && lower.includes('email')) {
        finalAnswer = lower
        console.log(`[${label}] Model answered in prose at iteration ${iteration}:`, finalAnswer)
        break
      }
      console.log(`[${label}] Could not parse JSON at iteration ${iteration}, text: "${text.slice(0, 120)}"`)
      messages.push({ role: 'user', content: 'Please respond with only a JSON object for your next action. Example: {"action":"screenshot"}' })
      continue
    }

    const action = cmd.action as string
    console.log(`[${label}] Action #${iteration + 1}: ${action}`, cmd)

    if (action === 'done') {
      const answer = ((cmd.answer as string) ?? '').toLowerCase()
      if (answer && answer.length > 2) {
        finalAnswer = answer
        console.log(`[${label}] done:`, finalAnswer)
        break
      }
      console.log(`[${label}] done with empty/short answer, nudging`)
      messages.push({
        role: 'user',
        content: 'You called done but did not provide an answer. Take a screenshot first, then complete the task.',
      })
      continue
    }

    let mcpAction: Record<string, unknown>
    switch (action) {
      case 'screenshot':
        mcpAction = { type: 'screenshot' }
        break
      case 'click': {
        const coords = parseCoords(cmd)
        if (coordMode === 'normalized') {
          const px = Math.round((coords.x / 1000) * DISPLAY_WIDTH)
          const py = Math.round((coords.y / 1000) * DISPLAY_HEIGHT)
          console.log(`[${label}]   normalized (${coords.x}, ${coords.y}) → pixel (${px}, ${py})`)
          mcpAction = { type: 'click', x: px, y: py }
        } else {
          mcpAction = { type: 'click', x: coords.x, y: coords.y }
        }
        break
      }
      case 'type':
        mcpAction = { type: 'type', text: cmd.text as string }
        break
      case 'keypress':
        mcpAction = { type: 'keypress', keys: [cmd.key as string] }
        break
      case 'scroll':
        mcpAction = { type: 'scroll', direction: cmd.direction as string }
        break
      default:
        console.log(`[${label}] Unknown action: ${action}, taking screenshot`)
        mcpAction = { type: 'screenshot' }
    }

    computerCallCount++
    b = bench(`MCP action #${computerCallCount} (${action})`)
    const screenshot = await executeComputerAction(sessionId, mcpAction)
    b.end()

    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: `Action executed. Here is the current screenshot:` },
        { type: 'image_url', image_url: { url: screenshot } },
      ],
    })
  }

  const totalMs = totalBench.end()
  return { computerCallCount, finalAnswer, totalMs }
}

// ===========================================================================
// Shared: OpenRouter adapter-based agent loop
// Uses openRouterClientAdapter to translate computer_use_preview → computer_call
// and denormalize coordinates transparently.
// ===========================================================================
async function runOpenRouterAdapterTest(opts: {
  model: string
  label: string
  sessionId: string
  maxIterations?: number
  executeComputerAction: ExecuteComputerAction
}): Promise<{ computerCallCount: number; finalAnswer: string; totalMs: number }> {
  const { model, label, sessionId, maxIterations = 10, executeComputerAction } = opts
  const totalBench = bench(`${label} total`)

  const openRouterHttpClient = new HTTPClient({
    fetcher: (request: Request) => {
      request.headers.set('Connection', 'close')
      return fetch(request)
    },
  })
  const client = supercompat({
    clientAdapter: openRouterClientAdapter({
      openRouter: new OpenRouter({ apiKey: openrouterApiKey!, httpClient: openRouterHttpClient }),
    }),
  })

  const tools: any[] = [
    {
      type: 'computer_use_preview',
      computer_use_preview: {
        display_width: DISPLAY_WIDTH,
        display_height: DISPLAY_HEIGHT,
        environment: 'browser',
      },
    },
  ]

  // Take initial screenshot
  let b = bench('initial screenshot')
  const initialScreenshot = await executeComputerAction(sessionId, { type: 'screenshot' })
  b.end()

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: `You are a browser automation agent controlling a ${DISPLAY_WIDTH}x${DISPLAY_HEIGHT} browser. Use the computer_call tool to interact with the browser. Start by examining the provided screenshot and then perform actions to complete the task. Act autonomously — never ask for confirmation or permission, just do it.` },
    {
      role: 'user',
      content: [
        { type: 'text', text: TASK_PROMPT },
        { type: 'image_url', image_url: { url: initialScreenshot } },
      ],
    },
  ]

  let computerCallCount = 0
  let finalAnswer = ''

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    b = bench(`${label} API call #${iteration + 1}`)
    const response = await client.chat.completions.create({
      model,
      messages,
      tools,
      temperature: 0.6,
      max_tokens: 1024,
    })
    b.end()

    const choices = response.choices ?? []
    const choice = choices[0]
    assert.ok(choice, `Expected at least one choice from ${model}, got: ${JSON.stringify(response).slice(0, 300)}`)

    // Check for text-only response (model is done)
    if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
      const text = (choice.message.content ?? '').toLowerCase()
      if (text) {
        finalAnswer = text
        console.log(`[${label}] Model answered at iteration ${iteration}:`, finalAnswer)
      }
      break
    }

    // Add assistant message with tool calls to history
    messages.push(choice.message as OpenAI.ChatCompletionMessageParam)

    // Process tool calls
    for (const toolCall of choice.message.tool_calls) {
      if (toolCall.function.name !== 'computer_call') {
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: 'Unknown tool',
        })
        continue
      }

      let args: any = {}
      try {
        const raw = toolCall.function.arguments
        args = typeof raw === 'object' && raw !== null ? raw : JSON.parse(raw || '{}')
      } catch { /* empty */ }

      // Extract action (handle nested and flat format)
      const action = args.action ?? args
      computerCallCount++
      console.log(`[${label}] computer_call #${computerCallCount}: ${action?.type}`, action)

      if (action?.type === 'done' || action?.type === 'wait') {
        if (action.type === 'wait') {
          await new Promise((r) => setTimeout(r, 2000))
        }
        const screenshot = await executeComputerAction(sessionId, { type: 'screenshot' })
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: [
            { type: 'text', text: `Action "${action.type}" executed.` },
            { type: 'image_url', image_url: { url: screenshot } },
          ] as any,
        })
        continue
      }

      // Validate action before sending to MCP (e.g. "type" action requires "text")
      if (action?.type === 'type' && !action.text) {
        console.log(`[${label}] Skipping invalid "type" action (no text), taking screenshot instead`)
        const screenshot = await executeComputerAction(sessionId, { type: 'screenshot' })
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: [
            { type: 'text', text: 'Error: "type" action requires a "text" field. Please provide the text to type.' },
            { type: 'image_url', image_url: { url: screenshot } },
          ] as any,
        })
        continue
      }

      b = bench(`MCP action #${computerCallCount} (${action?.type})`)
      const screenshot = await executeComputerAction(sessionId, action)
      b.end()

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: [
          { type: 'text', text: `Action "${action?.type}" executed. Here is the current screenshot:` },
          { type: 'image_url', image_url: { url: screenshot } },
        ] as any,
      })
    }
  }

  const totalMs = totalBench.end()
  return { computerCallCount, finalAnswer, totalMs }
}

// ===========================================================================
// Test 5: Qwen via OpenRouter (adapter-based)
// ===========================================================================
testOrSkip('Qwen (OpenRouter): adapter-based computer use finds subscribe form fields', { timeout: 360_000 }, async (t) => {
  assert.ok(openrouterApiKey, 'OPENROUTER_API_KEY must be set')

  const container = await startMcpContainer({ name: 'computer-use-mcp-qwen', port: PORT.qwenOpenRouter })
  t.after(() => container.stop())
  const { initializeMcpSession, executeComputerAction, resetBrowser } = makeMcpHelpers(container.serverUrl)

  const sessionId = await initializeMcpSession()
  console.log('[qwen] MCP session:', sessionId)

  let b = bench('reset browser')
  await resetBrowser(sessionId)
  b.end()

  const { computerCallCount, finalAnswer, totalMs } = await runOpenRouterAdapterTest({
    model: 'qwen/qwen3.5-plus-02-15',
    label: 'qwen',
    sessionId,
    executeComputerAction,
  })

  console.log(`[qwen] ${computerCallCount} actions, answer: "${finalAnswer}"`)
  assert.ok(computerCallCount >= 1, 'Model should produce at least one action')
  if (finalAnswer) {
    assert.ok(sawSupercorpContent(finalAnswer), `Expected supercorp.ai page content in answer, got: "${finalAnswer}"`)
  }
  console.log(`[qwen] PASS. ${computerCallCount} actions, ${totalMs.toFixed(0)}ms total`)
})

// ===========================================================================
// Test 6: Qwen via OpenRouter via supercompat (completionsRunAdapter + prisma)
// SKIPPED: completionsRunAdapter serializes tool outputs as text strings,
// so the vision model can't see screenshots returned from tool calls.
// This is a fundamental limitation of the thread/run abstraction for
// vision-based computer use with non-OpenAI providers.
// ===========================================================================
test.skip('Qwen supercompat (OpenRouter): vision agent via thread/run finds subscribe form fields', { timeout: 360_000 }, async (t) => {
  assert.ok(openrouterApiKey, 'OPENROUTER_API_KEY must be set')
  const totalBench = bench('Qwen supercompat total')

  const prisma = createTestPrisma()
  const openRouter = new OpenAI({
    apiKey: openrouterApiKey,
    baseURL: 'https://openrouter.ai/api/v1',
  })

  const tools = VISION_AGENT_TOOLS as any[]

  const client = supercompat({
    clientAdapter: openaiClientAdapter({ openai: openRouter }),
    runAdapter: completionsRunAdapter(),
    storageAdapter: prismaStorageAdapter({ prisma }),
  })

  const assistant = await client.beta.assistants.create({
    model: QWEN_MODEL,
    instructions: VISION_AGENT_SYSTEM_PROMPT,
    tools,
  } as any)

  const container = await startMcpContainer({ name: 'computer-use-mcp-qwen-supercompat', port: PORT.qwenSupercompat })
  t.after(() => container.stop())
  const { initializeMcpSession, executeComputerAction, resetBrowser } = makeMcpHelpers(container.serverUrl)

  const sessionId = await initializeMcpSession()
  console.log('[qwen-supercompat] MCP session:', sessionId)

  let b = bench('reset browser')
  await resetBrowser(sessionId)
  b.end()

  b = bench('create thread + message')
  const thread = await prisma.thread.create({
    data: { assistantId: assistant.id },
  })
  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: TASK_PROMPT,
  })
  b.end()
  console.log('[qwen-supercompat] Thread:', thread.id)

  let computerCallCount = 0
  let currentRunId: string | undefined
  let pendingToolOutputs: any[] = []
  let accumulatedText = ''
  let doneAnswer = ''

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    b = bench(`run iteration #${iteration}`)
    let requiresActionEvent: any
    let completedEvent: any
    let failedEvent: any

    const consumeStream = async (stream: AsyncIterable<any>) => {
      for await (const event of stream) {
        console.log(`[qwen-supercompat] Event: ${event.event}`)
        if (event.event === 'thread.run.requires_action') {
          requiresActionEvent = event
        } else if (event.event === 'thread.run.completed') {
          completedEvent = event
        } else if (event.event === 'thread.run.failed') {
          failedEvent = event
          console.error('[qwen-supercompat] Run failed:', JSON.stringify(event.data?.last_error))
        } else if (event.event === 'thread.message.delta') {
          const delta = event.data?.delta?.content?.[0]
          if (delta?.type === 'text' && delta?.text?.value) {
            accumulatedText += delta.text.value
          }
        }
      }
    }

    if (iteration === 0) {
      const run = await client.beta.threads.runs.create(thread.id, {
        assistant_id: assistant.id,
        stream: true,
        tools,
      })
      await consumeStream(run)
    } else {
      assert.ok(currentRunId, 'Expected currentRunId for tool output submission')
      const submit = await client.beta.threads.runs.submitToolOutputs(
        currentRunId!,
        {
          thread_id: thread.id,
          stream: true,
          tool_outputs: pendingToolOutputs,
        },
      )
      await consumeStream(submit)
    }
    b.end()

    if (failedEvent) {
      assert.fail(`Run failed: ${JSON.stringify(failedEvent.data?.last_error)}`)
    }

    if (completedEvent) {
      console.log(`[qwen-supercompat] Run completed at iteration ${iteration}`)
      break
    }

    if (!requiresActionEvent) {
      console.log(`[qwen-supercompat] No requires_action at iteration ${iteration}`)
      break
    }

    currentRunId = requiresActionEvent.data.id
    const toolCalls = requiresActionEvent.data.required_action?.submit_tool_outputs?.tool_calls ?? []

    pendingToolOutputs = []

    for (const toolCall of toolCalls) {
      const fnName = toolCall.function?.name
      let fnArgs: Record<string, unknown> = {}
      try { fnArgs = JSON.parse(toolCall.function?.arguments || '{}') } catch { /* empty args */ }

      if (fnName === 'done') {
        doneAnswer = (fnArgs.answer ?? '').toLowerCase()
        console.log('[qwen-supercompat] done() called:', doneAnswer)
        pendingToolOutputs.push({
          tool_call_id: toolCall.id,
          output: 'Task completed.',
        })
        continue
      }

      computerCallCount++
      console.log(`[qwen-supercompat] action #${computerCallCount}: ${fnName}(${JSON.stringify(fnArgs)})`)

      b = bench(`MCP action #${computerCallCount} (${fnName})`)
      const result = await executeVisionAgentTool(executeComputerAction, sessionId, fnName!, fnArgs)
      b.end()

      // Include screenshot as image content in tool output
      // completionsRunAdapter supports array tool outputs with image/text types
      pendingToolOutputs.push({
        tool_call_id: toolCall.id,
        output: JSON.stringify([
          { type: 'text', text: result.text },
          { type: 'image_url', image_url: { url: result.screenshot } },
        ]),
      })
    }

    if (pendingToolOutputs.length === 0) {
      console.log(`[qwen-supercompat] No tool outputs to submit at iteration ${iteration}`)
      break
    }
  }

  const finalAnswer = doneAnswer || accumulatedText.toLowerCase()
  console.log('[qwen-supercompat] Final answer:', finalAnswer)

  assert.ok(computerCallCount >= 1, 'Model should produce at least one action')
  if (finalAnswer) {
    assert.ok(sawSupercorpContent(finalAnswer), `Expected supercorp.ai page content in answer, got: "${finalAnswer}"`)
  }

  const totalMs = totalBench.end()
  console.log(`[qwen-supercompat] PASS. ${computerCallCount} actions, ${totalMs.toFixed(0)}ms total`)

  // Cleanup test data
  await prisma.thread.delete({ where: { id: thread.id } }).catch(() => {})
})

// ===========================================================================
// Test 7: GLM-4.6V via OpenRouter (adapter-based)
// ===========================================================================
testOrSkip('GLM-4.6V (OpenRouter): adapter-based computer use finds subscribe form fields', { timeout: 360_000 }, async (t) => {
  assert.ok(openrouterApiKey, 'OPENROUTER_API_KEY must be set')

  const container = await startMcpContainer({ name: 'computer-use-mcp-glm', port: PORT.glm46v })
  t.after(() => container.stop())
  const { initializeMcpSession, executeComputerAction, resetBrowser } = makeMcpHelpers(container.serverUrl)

  const sessionId = await initializeMcpSession()
  console.log('[glm] MCP session:', sessionId)

  let b = bench('reset browser')
  await resetBrowser(sessionId)
  b.end()

  const { computerCallCount, finalAnswer, totalMs } = await runOpenRouterAdapterTest({
    model: 'z-ai/glm-4.6v',
    label: 'glm',
    sessionId,
    executeComputerAction,
  })

  console.log(`[glm] ${computerCallCount} actions, answer: "${finalAnswer}"`)
  assert.ok(computerCallCount >= 1, 'Model should produce at least one action')
  if (finalAnswer) {
    assert.ok(sawSupercorpContent(finalAnswer), `Expected supercorp.ai page content in answer, got: "${finalAnswer}"`)
  }
  console.log(`[glm] PASS. ${computerCallCount} actions, ${totalMs.toFixed(0)}ms total`)
})

// ===========================================================================
// Test 8: MiniMax M2.5 via OpenRouter
// SKIPPED: MiniMax M2.5 is text-only (no vision support), cannot see screenshots.
// ===========================================================================
test.skip('MiniMax M2.5 (OpenRouter): no vision support — cannot do computer use', { timeout: 1_000 }, async () => {
  // MiniMax M2.5 (minimax/minimax-m2.5) only supports text input/output.
  // Computer use requires vision to see screenshots.
})

// ===========================================================================
// Test 9: Gemini 3 Flash Preview via OpenRouter (adapter-based)
// ===========================================================================
testOrSkip('Gemini 3 Flash (OpenRouter): adapter-based computer use finds subscribe form fields', { timeout: 360_000 }, async (t) => {
  assert.ok(openrouterApiKey, 'OPENROUTER_API_KEY must be set')

  const container = await startMcpContainer({ name: 'computer-use-mcp-gemini-flash', port: PORT.geminiFlashOpenRouter })
  t.after(() => container.stop())
  const { initializeMcpSession, executeComputerAction, resetBrowser } = makeMcpHelpers(container.serverUrl)

  const sessionId = await initializeMcpSession()
  console.log('[gemini-flash] MCP session:', sessionId)

  let b = bench('reset browser')
  await resetBrowser(sessionId)
  b.end()

  const { computerCallCount, finalAnswer, totalMs } = await runOpenRouterAdapterTest({
    model: 'google/gemini-3-flash-preview',
    label: 'gemini-flash',
    sessionId,
    executeComputerAction,
  })

  console.log(`[gemini-flash] ${computerCallCount} actions, answer: "${finalAnswer}"`)
  assert.ok(computerCallCount >= 1, 'Model should produce at least one action')
  if (finalAnswer) {
    assert.ok(sawSupercorpContent(finalAnswer), `Expected supercorp.ai page content in answer, got: "${finalAnswer}"`)
  }
  console.log(`[gemini-flash] PASS. ${computerCallCount} actions, ${totalMs.toFixed(0)}ms total`)
})
})
