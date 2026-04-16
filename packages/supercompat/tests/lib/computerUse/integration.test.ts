/**
 * Computer Use Integration Test
 *
 * Each test spins up its own @supercorp/computer-use-mcp Docker container
 * so they can run concurrently without browser state conflicts.
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
const CONTAINER_PREFIX = 'computer-use-mcp-supercompat-test'
const DOCKER_IMAGE = 'computer-use-mcp-dev'
const BASE_PORT = 3199
const DOCKER_CONTEXT = process.env.COMPUTER_USE_MCP_DIR ?? path.resolve(__dirname, '../../../../../../computer-use-mcp')
const HEALTH_TIMEOUT_MS = 120_000

// Skip if Docker is not available
try { execSync('docker info', { stdio: 'ignore' }) } catch {
  console.log('Skipping: Docker is not available')
  process.exit(0)
}

const apiKey = process.env.TEST_OPENAI_API_KEY
if (!apiKey) {
  console.log('Skipping: TEST_OPENAI_API_KEY required')
  process.exit(0)
}

// --- Docker helpers ---

let nextPort = BASE_PORT

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

function killContainer(name: string) {
  try { execSync(`docker kill ${name}`, { stdio: 'ignore' }) } catch {}
  try { execSync(`docker rm ${name}`, { stdio: 'ignore' }) } catch {}
}

function startContainer(name: string, port: number): ChildProcess {
  return spawn('docker', [
    'run', '--rm', '--name', name,
    '--platform', 'linux/amd64',
    '-p', `${port}:8000`,
    DOCKER_IMAGE,
    '--transport', 'http',
    '--toolSchema', 'loose',
    '--defaultUrl', 'https://example.com',
    '--postActionDelayMs', '500',
  ], { stdio: 'pipe' })
}

async function waitForHealth(port: number): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/healthz`)
      if (res.ok) return
    } catch {}
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`Container on port ${port} did not become healthy`)
}

// --- MCP Session ---

class McpSession {
  private sessionId: string | null = null
  private requestId = 0
  private baseUrl: string

  constructor(port: number) {
    this.baseUrl = `http://localhost:${port}`
  }

  async initialize() {
    const res = await this.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'supercompat-test', version: '1.0' },
    })

    await fetch(this.baseUrl, {
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
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    })

    const sid = res.headers.get('mcp-session-id')
    if (sid) this.sessionId = sid

    const text = await res.text()
    const dataLine = text.split('\n').find(l => l.startsWith('data: '))
    return dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(text)
  }
}

// --- Per-test environment ---

interface TestEnv {
  mcp: McpSession
  container: ChildProcess
  containerName: string
}

async function createTestEnv(): Promise<TestEnv> {
  const port = nextPort++
  const containerName = `${CONTAINER_PREFIX}-${port}`

  killContainer(containerName)
  const container = startContainer(containerName, port)
  container.stderr?.on('data', (d: Buffer) => {
    const msg = d.toString()
    if (msg.includes('Error') || msg.includes('error')) process.stderr.write(`[mcp:${port}] ${msg}`)
  })

  await waitForHealth(port)

  const mcp = new McpSession(port)
  await mcp.initialize()

  // Warm up: trigger browser launch
  await mcp.callTool('computer_call', { action: { type: 'screenshot' } })
  await new Promise(r => setTimeout(r, 5_000))

  return { mcp, container, containerName }
}

function destroyTestEnv(env: TestEnv) {
  killContainer(env.containerName)
}

// --- Tests ---

describe('Computer Use Integration', { concurrency: true, timeout: 60_000 }, () => {
  before(() => {
    buildImage()
  })

  test('MCP tools are available', async () => {
    const env = await createTestEnv()
    try {
      const result = await env.mcp.listTools()
      const tools = result?.result?.tools || []
      const names = tools.map((t: any) => t.name)
      assert.ok(names.includes('computer_call'), `Should have computer_call. Got: ${names}`)
    } finally {
      destroyTestEnv(env)
    }
  })

  test('screenshot returns image data', async () => {
    const env = await createTestEnv()
    try {
      const result = await env.mcp.callTool('computer_call', { action: { type: 'screenshot' } })
      const content = result?.result?.content || []
      const image = content.find((c: any) => c.type === 'image')
      assert.ok(image, 'Should return image content')
      assert.ok(image.data, 'Should have base64 data')
      assert.ok(image.data.length > 1000, 'Image should have substantial data')
    } finally {
      destroyTestEnv(env)
    }
  })

  test('Responses API: computer use round-trip', { timeout: 60_000 }, async () => {
    const env = await createTestEnv()
    try {
      const client = new OpenAI({ apiKey })

      const response1 = await client.responses.create({
        model: 'gpt-5.4-mini',
        input: 'Take a screenshot of the current page.',
        truncation: 'auto',
        tools: [{ type: 'computer' as any }],
      })

      assert.equal(response1.status, 'completed')
      const computerCall = response1.output.find((o: any) => o.type === 'computer_call')
      assert.ok(computerCall, 'Model should request a computer action')

      const actions = computerCall.actions || [computerCall.action]
      const firstAction = actions[0]
      const mcpResult = await env.mcp.callTool('computer_call', { action: firstAction })
      const mcpContent = mcpResult?.result?.content || []
      const screenshot = mcpContent.find((c: any) => c.type === 'image')

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

      const hasMessage = response2.output.some((o: any) => o.type === 'message')
      const hasAction = response2.output.some((o: any) => o.type === 'computer_call')
      assert.ok(hasMessage || hasAction, 'Should have either a message or another action')
    } finally {
      destroyTestEnv(env)
    }
  })

  test('Assistants API: computer use via function tool', { timeout: 60_000 }, async () => {
    const env = await createTestEnv()
    try {
      const client = new OpenAI({ apiKey })

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

      const run = await client.beta.threads.runs.createAndPoll(thread.id, {
        assistant_id: assistant.id,
      })

      assert.equal(run.status, 'requires_action')
      const tc = run.required_action!.submit_tool_outputs.tool_calls[0]
      assert.equal(tc.function.name, 'computer_call')

      const args = JSON.parse(tc.function.arguments)
      const action = args.action || { type: 'screenshot' }

      const mcpResult = await env.mcp.callTool('computer_call', { action })
      const mcpContent = mcpResult?.result?.content || []
      const screenshot = mcpContent.find((c: any) => c.type === 'image')
      assert.ok(screenshot?.data, 'MCP should return screenshot')

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

      const messages = await client.beta.threads.messages.list(thread.id)
      const assistantMsg = messages.data.find(m => m.role === 'assistant')
      assert.ok(assistantMsg, 'Should have assistant message')

      await client.beta.threads.delete(thread.id)
      await client.beta.assistants.delete(assistant.id)
    } finally {
      destroyTestEnv(env)
    }
  })

  test('Anthropic: computer use round-trip', { timeout: 60_000 }, async () => {
    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicKey) {
      console.log('Skipping Anthropic computer use: ANTHROPIC_API_KEY required')
      return
    }

    const env = await createTestEnv()
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const anthropic = new Anthropic({ apiKey: anthropicKey })

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

      const mcpAction = typeof action === 'string' ? { type: action } : action
      const mcpResult = await env.mcp.callTool('computer_call', { action: mcpAction })
      const mcpContent = mcpResult?.result?.content || []
      const screenshot = mcpContent.find((c: any) => c.type === 'image')
      assert.ok(screenshot?.data, 'MCP should return screenshot')

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
      const hasText = response2.content.some((c: any) => c.type === 'text')
      const hasToolUse = response2.content.some((c: any) => c.type === 'tool_use')
      assert.ok(hasText || hasToolUse, 'Should have text or another tool use')
    } finally {
      destroyTestEnv(env)
    }
  })

  test('Responses API: multi-step browser task', { timeout: 180_000 }, async () => {
    const env = await createTestEnv()
    try {
      const client = new OpenAI({ apiKey })

      const tools = [{ type: 'computer' as any }]
      const systemPrompt = 'You are controlling a browser. Execute actions step by step. After each action you will receive a screenshot. When you have the answer, respond with text.'

      async function runTurn(input: any): Promise<any> {
        return client.responses.create({
          model: 'gpt-5.4-mini',
          instructions: systemPrompt,
          truncation: 'auto',
          tools,
          ...input,
        })
      }

      async function executeAndScreenshot(computerCall: any): Promise<{ screenshotBase64: string }> {
        const actions = computerCall.actions || [computerCall.action]

        for (const action of actions) {
          await env.mcp.callTool('computer_call', { action })
          await new Promise(r => setTimeout(r, 500))
        }

        const ssResult = await env.mcp.callTool('computer_call', { action: { type: 'screenshot' } })
        const ssContent = ssResult?.result?.content || []
        const screenshot = ssContent.find((c: any) => c.type === 'image')
        assert.ok(screenshot?.data, 'Should have screenshot data')

        return { screenshotBase64: screenshot.data }
      }

      let response = await runTurn({
        input: 'Go to supercorp.ai and scroll to the bottom of the page. Find the title of the latest blog post.',
      })

      let turns = 0
      const maxTurns = 15

      while (turns < maxTurns) {
        turns++
        const computerCall = response.output.find((o: any) => o.type === 'computer_call')
        const textMessage = response.output.find((o: any) => o.type === 'message')

        if (textMessage && !computerCall) {
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

        const { screenshotBase64 } = await executeAndScreenshot(computerCall)

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
    } finally {
      destroyTestEnv(env)
    }
  })

  test('Anthropic: multi-step browser task', { timeout: 180_000 }, async () => {
    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicKey) {
      console.log('Skipping Anthropic multi-step: ANTHROPIC_API_KEY required')
      return
    }

    const env = await createTestEnv()
    try {
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

        const mcpResult = await env.mcp.callTool('computer_call', { action: mcpAction })
        const mcpContent = mcpResult?.result?.content || []
        const screenshot = mcpContent.find((c: any) => c.type === 'image')

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

      assert.ok(turns > 1, 'Should have made at least 2 turns of interaction')
    } finally {
      destroyTestEnv(env)
    }
  })

  test('Google Gemini: computer use round-trip', { timeout: 60_000 }, async () => {
    const googleKey = process.env.GOOGLE_API_KEY
    if (!googleKey) {
      console.log('Skipping Google computer use: GOOGLE_API_KEY required')
      return
    }

    const env = await createTestEnv()
    try {
      const { GoogleGenAI } = await import('@google/genai')
      const google = new GoogleGenAI({ apiKey: googleKey })

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

      const action = functionCall!.functionCall!.args as any
      const mcpAction = action?.action || { type: 'screenshot' }

      const mcpResult = await env.mcp.callTool('computer_call', { action: mcpAction })
      const mcpContent = mcpResult?.result?.content || []
      const screenshot = mcpContent.find((c: any) => c.type === 'image')
      assert.ok(screenshot?.data, 'MCP should return screenshot')

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
    } finally {
      destroyTestEnv(env)
    }
  })
})
