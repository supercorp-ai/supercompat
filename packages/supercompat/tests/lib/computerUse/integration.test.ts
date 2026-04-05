/**
 * Computer Use Integration Test
 *
 * Spins up a @supercorp/computer-use-mcp Docker container, then tests
 * computer use tool calls through the Responses API.
 *
 * Requires: Docker running, TEST_OPENAI_API_KEY set.
 */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execSync, spawn, type ChildProcess } from 'child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import OpenAI from 'openai'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONTAINER_NAME = 'computer-use-mcp-supercompat-test'
const DOCKER_IMAGE = 'computer-use-mcp-dev'
const MCP_PORT = 3199
const MCP_URL = `http://localhost:${MCP_PORT}`
const DOCKER_CONTEXT = process.env.COMPUTER_USE_MCP_DIR ?? path.resolve(__dirname, '../../../../../../computer-use-mcp')
const HEALTH_TIMEOUT_MS = 120_000

const apiKey = process.env.TEST_OPENAI_API_KEY
if (!apiKey) {
  console.log('Skipping: TEST_OPENAI_API_KEY required')
  process.exit(0)
}

// --- Docker helpers ---

function buildImage() {
  try {
    execSync(`docker image inspect ${DOCKER_IMAGE}`, { stdio: 'ignore' })
  } catch {
    console.log(`Building ${DOCKER_IMAGE}...`)
    execSync(`docker build --platform=linux/amd64 -t ${DOCKER_IMAGE} .`, {
      cwd: DOCKER_CONTEXT,
      stdio: 'inherit',
    })
  }
}

function killContainer() {
  try { execSync(`docker kill ${CONTAINER_NAME}`, { stdio: 'ignore' }) } catch {}
  try { execSync(`docker rm ${CONTAINER_NAME}`, { stdio: 'ignore' }) } catch {}
}

function startContainer(): ChildProcess {
  return spawn('docker', [
    'run', '--rm', '--name', CONTAINER_NAME,
    '--platform', 'linux/amd64',
    '-p', `${MCP_PORT}:8000`,
    DOCKER_IMAGE,
    '--transport', 'http',
    '--toolSchema', 'loose',
    '--defaultUrl', 'https://example.com',
    '--postActionDelayMs', '500',
  ], { stdio: 'pipe' })
}

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${MCP_URL}/healthz`)
      if (res.ok) return
    } catch {}
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error('Container did not become healthy')
}

// --- MCP Session ---

class McpSession {
  private sessionId: string | null = null
  private requestId = 0

  async initialize() {
    const res = await this.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'supercompat-test', version: '1.0' },
    })

    // Send initialized notification
    await fetch(MCP_URL, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    })

    return res
  }

  async callTool(name: string, args: any) {
    return this.send('tools/call', { name, arguments: args })
  }

  async listTools() {
    return this.send('tools/list')
  }

  private headers() {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    }
    if (this.sessionId) h['Mcp-Session-Id'] = this.sessionId
    return h
  }

  private async send(method: string, params: any = {}) {
    const id = ++this.requestId
    const res = await fetch(MCP_URL, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    })

    // Capture session ID from first response
    const sid = res.headers.get('mcp-session-id')
    if (sid) this.sessionId = sid

    const text = await res.text()
    const dataLine = text.split('\n').find(l => l.startsWith('data: '))
    return dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(text)
  }
}

// --- Tests ---

describe('Computer Use Integration', { timeout: 300_000 }, () => {
  let container: ChildProcess
  let mcp: McpSession

  before(async () => {
    buildImage()
    killContainer()
    container = startContainer()
    container.stderr?.on('data', (d: Buffer) => {
      const msg = d.toString()
      if (msg.includes('Error') || msg.includes('error')) process.stderr.write(`[mcp] ${msg}`)
    })

    await waitForHealth()

    mcp = new McpSession()
    await mcp.initialize()

    // Warm up: trigger browser launch
    await mcp.callTool('computer_call', { action: { type: 'screenshot' } })
    await new Promise(r => setTimeout(r, 10_000))
  })

  after(() => {
    killContainer()
  })

  test('MCP tools are available', async () => {
    const result = await mcp.listTools()
    const tools = result?.result?.tools || []
    const names = tools.map((t: any) => t.name)
    assert.ok(names.includes('computer_call'), `Should have computer_call. Got: ${names}`)
  })

  test('screenshot returns image data', async () => {
    const result = await mcp.callTool('computer_call', { action: { type: 'screenshot' } })
    const content = result?.result?.content || []
    const image = content.find((c: any) => c.type === 'image')
    assert.ok(image, 'Should return image content')
    assert.ok(image.data, 'Should have base64 data')
    assert.ok(image.data.length > 1000, 'Image should have substantial data')
  })

  test('Responses API: computer use round-trip', { timeout: 120_000 }, async () => {
    const client = new OpenAI({ apiKey })

    // Step 1: Ask model to take a screenshot
    const response1 = await client.responses.create({
      model: 'gpt-5.4-mini',
      input: 'Take a screenshot of the current page.',
      truncation: 'auto',
      tools: [{
        type: 'computer' as any,
      }],
    })

    assert.equal(response1.status, 'completed')
    const computerCall = response1.output.find((o: any) => o.type === 'computer_call')
    assert.ok(computerCall, 'Model should request a computer action')

    // Step 2: Execute the action via MCP
    // GA computer tool uses 'actions' (array), MCP expects 'action' (singular)
    const actions = computerCall.actions || [computerCall.action]
    const firstAction = actions[0]
    const mcpResult = await mcp.callTool('computer_call', { action: firstAction })
    const mcpContent = mcpResult?.result?.content || []
    const screenshot = mcpContent.find((c: any) => c.type === 'image')

    // Step 3: Send screenshot back as base64
    assert.ok(screenshot?.data, 'Should have screenshot data')

    const response2 = await client.responses.create({
      model: 'gpt-5.4-mini',
      truncation: 'auto',
      tools: [{ type: 'computer' as any }],
      previous_response_id: response1.id,
      input: [{
        type: 'computer_call_output' as any,
        call_id: computerCall.call_id,
        output: {
          type: 'computer_screenshot',
          image_url: `data:image/png;base64,${screenshot.data}`,
        },
      }],
    })

    assert.equal(response2.status, 'completed')
    assert.ok(response2.output.length > 0, 'Should have output after screenshot')

    // The model should describe what it sees or request another action
    const hasMessage = response2.output.some((o: any) => o.type === 'message')
    const hasAction = response2.output.some((o: any) => o.type === 'computer_call')
    assert.ok(hasMessage || hasAction, 'Should have either a message or another action')
  })

  test('Assistants API: computer use via function tool', { timeout: 120_000 }, async () => {
    const client = new OpenAI({ apiKey })

    // On the Assistants API, computer use is exposed as a function tool
    // that wraps MCP calls (same as superinterface does)
    const assistant = await client.beta.assistants.create({
      model: 'gpt-4.1-mini',
      instructions: 'You have a computer_call tool. Use it to take screenshots when asked. Call it with {"action": {"type": "screenshot"}}.',
      tools: [{
        type: 'function',
        function: {
          name: 'computer_call',
          description: 'Execute a computer action (screenshot, click, type, etc.)',
          parameters: {
            type: 'object',
            properties: {
              action: {
                type: 'object',
                properties: {
                  type: { type: 'string', description: 'Action type: screenshot, click, type, scroll, etc.' },
                },
                required: ['type'],
              },
            },
            required: ['action'],
          },
        },
      }],
    })

    const thread = await client.beta.threads.create()
    await client.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: 'Take a screenshot of the current page using the computer_call tool.',
    })

    // Step 1: Run should require action
    const run = await client.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistant.id,
    })

    assert.equal(run.status, 'requires_action')
    const tc = run.required_action!.submit_tool_outputs.tool_calls[0]
    assert.equal(tc.function.name, 'computer_call')

    const args = JSON.parse(tc.function.arguments)
    const action = args.action || { type: 'screenshot' }

    // Step 2: Execute via MCP
    const mcpResult = await mcp.callTool('computer_call', { action })
    const mcpContent = mcpResult?.result?.content || []
    const screenshot = mcpContent.find((c: any) => c.type === 'image')
    assert.ok(screenshot?.data, 'MCP should return screenshot')

    // Step 3: Submit tool output
    const completed = await client.beta.threads.runs.submitToolOutputsAndPoll(run.id, {
      thread_id: thread.id,
      tool_outputs: [{
        tool_call_id: tc.id,
        output: JSON.stringify({
          screenshot: `data:image/png;base64,${screenshot.data.slice(0, 100)}...`,
          description: 'Screenshot of example.com homepage',
        }),
      }],
    })

    assert.equal(completed.status, 'completed')

    // Verify assistant responded
    const messages = await client.beta.threads.messages.list(thread.id)
    const assistantMsg = messages.data.find(m => m.role === 'assistant')
    assert.ok(assistantMsg, 'Should have assistant message')

    // Cleanup
    await client.beta.threads.delete(thread.id)
    await client.beta.assistants.delete(assistant.id)
  })

  test('Anthropic: computer use round-trip', { timeout: 120_000 }, async () => {
    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicKey) {
      console.log('Skipping Anthropic computer use: ANTHROPIC_API_KEY required')
      return
    }

    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const anthropic = new Anthropic({ apiKey: anthropicKey })

    // Step 1: Ask model to take a screenshot
    const response1 = await anthropic.beta.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      betas: ['computer-use-2025-01-24'],
      tools: [{
        type: 'computer_20250124' as any,
        name: 'computer',
        display_width_px: 1280,
        display_height_px: 720,
      }],
      messages: [{
        role: 'user',
        content: 'Take a screenshot of the current page.',
      }],
    })

    const toolUse = response1.content.find((c: any) => c.type === 'tool_use')
    assert.ok(toolUse, 'Anthropic should request a tool use')
    const action = (toolUse as any).input?.action || (toolUse as any).input || 'screenshot'

    // Step 2: Execute via MCP
    const mcpAction = typeof action === 'string' ? { type: action } : action
    const mcpResult = await mcp.callTool('computer_call', { action: mcpAction })
    const mcpContent = mcpResult?.result?.content || []
    const screenshot = mcpContent.find((c: any) => c.type === 'image')
    assert.ok(screenshot?.data, 'MCP should return screenshot')

    // Step 3: Send tool result back
    const response2 = await anthropic.beta.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      betas: ['computer-use-2025-01-24'],
      tools: [{
        type: 'computer_20250124' as any,
        name: 'computer',
        display_width_px: 1280,
        display_height_px: 720,
      }],
      messages: [
        { role: 'user', content: 'Take a screenshot of the current page.' },
        { role: 'assistant', content: response1.content },
        {
          role: 'user',
          content: [{
            type: 'tool_result' as any,
            tool_use_id: (toolUse as any).id,
            content: [{
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: screenshot.data,
              },
            }],
          }],
        },
      ],
    })

    assert.ok(response2.content.length > 0, 'Should have response content')
    // Model should describe what it sees or request another action
    const hasText = response2.content.some((c: any) => c.type === 'text')
    const hasToolUse = response2.content.some((c: any) => c.type === 'tool_use')
    assert.ok(hasText || hasToolUse, 'Should have text or another tool use')
  })

  test('Responses API: multi-step browser task', { timeout: 180_000 }, async () => {
    const client = new OpenAI({ apiKey })

    const tools = [{ type: 'computer' as any }]
    const systemPrompt = 'You are controlling a browser. Execute actions step by step. After each action you will receive a screenshot. When you have the answer, respond with text.'

    // Helper to run one computer use turn
    async function runTurn(input: any): Promise<any> {
      const response = await client.responses.create({
        model: 'gpt-5.4-mini',
        instructions: systemPrompt,
        truncation: 'auto',
        tools,
        ...input,
      })

      return response
    }

    // Helper to execute computer action via MCP and get screenshot
    async function executeAndScreenshot(computerCall: any): Promise<{ screenshotBase64: string }> {
      const actions = computerCall.actions || [computerCall.action]

      // Execute each action
      for (const action of actions) {
        await mcp.callTool('computer_call', { action })
        await new Promise(r => setTimeout(r, 500))
      }

      // Take a screenshot after all actions
      const ssResult = await mcp.callTool('computer_call', { action: { type: 'screenshot' } })
      const ssContent = ssResult?.result?.content || []
      const screenshot = ssContent.find((c: any) => c.type === 'image')
      assert.ok(screenshot?.data, 'Should have screenshot data')

      return { screenshotBase64: screenshot.data }
    }

    // Turn 1: Ask to navigate to supercorp.ai
    let response = await runTurn({
      input: 'Go to supercorp.ai and scroll to the bottom of the page. Find the title of the latest blog post.',
    })

    let turns = 0
    const maxTurns = 15

    // Loop: execute actions until model gives a text response
    while (turns < maxTurns) {
      turns++
      const computerCall = response.output.find((o: any) => o.type === 'computer_call')
      const textMessage = response.output.find((o: any) => o.type === 'message')

      if (textMessage && !computerCall) {
        // Model responded with text — we're done
        const text = textMessage.content?.[0]?.text || ''
        console.log(`[Turn ${turns}] Model response: ${text.slice(0, 200)}`)
        assert.ok(text.length > 0, 'Should have a text response')
        break
      }

      if (!computerCall) {
        console.log(`[Turn ${turns}] No computer call or message. Status: ${response.status}`)
        break
      }

      const actions = computerCall.actions || [computerCall.action]
      console.log(`[Turn ${turns}] Actions: ${actions.map((a: any) => a.type).join(', ')}`)

      // Execute and get screenshot
      const { screenshotBase64 } = await executeAndScreenshot(computerCall)

      // Send result back as base64
      response = await runTurn({
        previous_response_id: response.id,
        input: [{
          type: 'computer_call_output',
          call_id: computerCall.call_id,
          output: { type: 'computer_screenshot', image_url: `data:image/png;base64,${screenshotBase64}` },
        }],
      })
    }

    assert.ok(turns < maxTurns, `Should complete within ${maxTurns} turns, used ${turns}`)
  })

  test('Anthropic: multi-step browser task', { timeout: 180_000 }, async () => {
    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicKey) {
      console.log('Skipping Anthropic multi-step: ANTHROPIC_API_KEY required')
      return
    }

    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const anthropic = new Anthropic({ apiKey: anthropicKey })

    const tools: any[] = [{
      type: 'computer_20250124',
      name: 'computer',
      display_width_px: 1280,
      display_height_px: 720,
    }]

    let messages: any[] = [{
      role: 'user',
      content: 'Go to supercorp.ai and scroll to the bottom. Tell me the title of the latest blog post.',
    }]

    let turns = 0
    const maxTurns = 15

    while (turns < maxTurns) {
      turns++

      const response = await anthropic.beta.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        betas: ['computer-use-2025-01-24'],
        tools,
        messages,
      })

      const toolUse = response.content.find((c: any) => c.type === 'tool_use')
      const textBlock = response.content.find((c: any) => c.type === 'text')

      if (textBlock && !toolUse) {
        console.log(`[Anthropic Turn ${turns}] Response: ${(textBlock as any).text.slice(0, 200)}`)
        assert.ok((textBlock as any).text.length > 0, 'Should have text')
        break
      }

      if (!toolUse) break

      const action = (toolUse as any).input?.action || (toolUse as any).input
      const mcpAction = typeof action === 'string' ? { type: action } : action
      console.log(`[Anthropic Turn ${turns}] Action: ${mcpAction.type}`)

      // Execute via MCP
      const mcpResult = await mcp.callTool('computer_call', { action: mcpAction })
      const mcpContent = mcpResult?.result?.content || []
      const screenshot = mcpContent.find((c: any) => c.type === 'image')

      // Build next messages
      messages = [
        ...messages,
        { role: 'assistant', content: response.content },
        {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: (toolUse as any).id,
            content: screenshot ? [{
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: screenshot.data },
            }] : 'Action executed',
          }],
        },
      ]
    }

    // Model might not complete the task in time — that's OK for the multi-step test.
    // The important thing is that it made computer use calls and interacted with the browser.
    assert.ok(turns > 1, 'Should have made at least 2 turns of interaction')
  })

  test('Google Gemini: computer use round-trip', { timeout: 120_000 }, async () => {
    const googleKey = process.env.GOOGLE_API_KEY
    if (!googleKey) {
      console.log('Skipping Google computer use: GOOGLE_API_KEY required')
      return
    }

    const { GoogleGenAI } = await import('@google/genai')
    const google = new GoogleGenAI({ apiKey: googleKey })

    // Step 1: Ask model to take a screenshot
    const response1 = await google.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: 'Take a screenshot of the current page.' }] }],
      config: {
        tools: [{ computerUse: { environment: 'ENVIRONMENT_BROWSER' } }],
      },
    })

    const parts = response1.candidates?.[0]?.content?.parts || []
    const functionCall = parts.find((p: any) => p.functionCall)
    assert.ok(functionCall, 'Gemini should request a function call for computer use')

    // Get the action
    const action = functionCall!.functionCall!.args as any
    const mcpAction = action?.action || { type: 'screenshot' }

    // Step 2: Execute via MCP
    const mcpResult = await mcp.callTool('computer_call', { action: mcpAction })
    const mcpContent = mcpResult?.result?.content || []
    const screenshot = mcpContent.find((c: any) => c.type === 'image')
    assert.ok(screenshot?.data, 'MCP should return screenshot')

    // Step 3: Send result back
    const response2 = await google.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        { role: 'user', parts: [{ text: 'Take a screenshot.' }] },
        { role: 'model', parts: [functionCall!] },
        {
          role: 'user',
          parts: [{
            functionResponse: {
              name: functionCall!.functionCall!.name,
              response: {
                current_url: 'https://example.com',
                screenshot: `data:image/png;base64,${screenshot.data}`,
              },
            },
          }],
        },
      ],
      config: {
        tools: [{ computerUse: { environment: 'ENVIRONMENT_BROWSER' } }],
      },
    })

    assert.ok(response2.candidates?.[0]?.content?.parts?.length > 0, 'Should have response')
  })
})
