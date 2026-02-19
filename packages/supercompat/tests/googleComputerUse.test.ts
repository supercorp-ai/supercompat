import { test, before, after } from 'node:test'
import { strict as assert } from 'node:assert'
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { GoogleGenAI } from '@google/genai'
import { PrismaClient } from '@prisma/client'
import {
  supercompat,
  googleClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from '../src/index.ts'

const googleApiKey = process.env.GOOGLE_API_KEY

if (!googleApiKey) {
  throw new Error('GOOGLE_API_KEY is required to run this test')
}

// ---------------------------------------------------------------------------
// Docker configuration
// ---------------------------------------------------------------------------
const CONTAINER_NAME = 'computer-use-mcp-google-test'
const DOCKER_IMAGE = 'computer-use-mcp-dev'
const MCP_PORT = 3102
const MCP_SERVER_URL = `http://localhost:${MCP_PORT}`
const DOCKER_CONTEXT_DIR = process.env.COMPUTER_USE_MCP_DIR ?? '../computer-use-mcp'
const DEFAULT_URL = 'https://supercorp.ai'
const HEALTH_TIMEOUT_MS = 60_000
const HEALTH_POLL_MS = 1_000

const tools = [
  {
    type: 'computer_use_preview',
    computer_use_preview: {
      display_width: 1280,
      display_height: 720,
    },
  },
] as any[]

// ---------------------------------------------------------------------------
// Docker lifecycle helpers
// ---------------------------------------------------------------------------

function cleanupContainer() {
  try {
    execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore' })
  } catch {
    // container may not exist
  }
}

function buildImage() {
  if (process.env.SKIP_DOCKER_BUILD === 'true') return
  execSync(`docker build --platform=linux/amd64 -t ${DOCKER_IMAGE} .`, {
    cwd: DOCKER_CONTEXT_DIR,
    stdio: 'ignore',
  })
}

function startContainer(): ChildProcess {
  const child = spawn(
    'docker',
    [
      'run', '--rm',
      '--name', CONTAINER_NAME,
      '--platform', 'linux/amd64',
      '-p', `${MCP_PORT}:8000`,
      DOCKER_IMAGE,
      '--transport', 'http',
      '--toolSchema', 'loose',
      '--imageOutputFormat', 'openai-responses-api',
      '--defaultUrl', DEFAULT_URL,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  return child
}

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${MCP_SERVER_URL}/healthz`)
      if (res.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS))
  }
  throw new Error(`Container did not become healthy within ${HEALTH_TIMEOUT_MS}ms`)
}

// =========================================================================
// MCP client helper — talks to computer-use-mcp Docker server via JSON-RPC
// =========================================================================

class McpClient {
  private sessionId: string | null = null

  constructor(private url: string) {}

  private async rpc(method: string, params: Record<string, any> = {}, id: number = 1) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    }
    if (this.sessionId) {
      headers['mcp-session-id'] = this.sessionId
    }

    const res = await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    })

    const sid = res.headers.get('mcp-session-id')
    if (sid) this.sessionId = sid

    const text = await res.text()
    const dataLine = text.split('\n').find((l) => l.startsWith('data: '))
    if (dataLine) {
      return JSON.parse(dataLine.slice(6))
    }
    return JSON.parse(text)
  }

  async initialize() {
    return this.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'supercompat-test', version: '1.0' },
    })
  }

  async callTool(name: string, args: Record<string, any>) {
    return this.rpc('tools/call', { name, arguments: args }, 2)
  }

  async warmUp() {
    await this.callTool('computer_call', { action: { type: 'screenshot' } })
    await new Promise((r) => setTimeout(r, 30000))
    await this.callTool('computer_call', { action: { type: 'screenshot' } })
  }
}

/** Actions the MCP server actually handles */
const KNOWN_MCP_ACTIONS = new Set([
  'screenshot', 'click', 'double_click', 'triple_click', 'type',
  'keypress', 'scroll', 'move', 'drag', 'wait',
])

async function executeComputerCall(
  mcpClient: McpClient,
  action: Record<string, any>,
): Promise<string> {
  const effectiveAction = KNOWN_MCP_ACTIONS.has(action?.type)
    ? action
    : { type: 'screenshot' }

  const result = await mcpClient.callTool('computer_call', { action: effectiveAction })

  // --imageOutputFormat openai-responses-api returns structuredContent with input_image
  const structured = result.result?.structuredContent?.content ?? []
  const imageItem = structured.find((c: any) => c.type === 'input_image' && c.image_url)

  if (imageItem) {
    return JSON.stringify({
      type: 'computer_screenshot',
      image_url: imageItem.image_url,
    })
  }

  // Fallback: check standard MCP content format
  const content = result.result?.content ?? []
  const imageContent = content.find((c: any) => c.type === 'image')

  if (imageContent) {
    const imageUrl = `data:${imageContent.mimeType};base64,${imageContent.data}`
    return JSON.stringify({
      type: 'computer_screenshot',
      image_url: imageUrl,
    })
  }

  const textContent = content.find((c: any) => c.type === 'text')
  return textContent?.text ?? 'No screenshot returned'
}

// ---------------------------------------------------------------------------
// Docker lifecycle (shared across all tests in this file)
// ---------------------------------------------------------------------------
let containerProcess: ChildProcess | undefined

before(async () => {
  cleanupContainer()
  buildImage()
  containerProcess = startContainer()
  await waitForHealth()
}, { timeout: 120_000 })

after(async () => {
  try {
    execSync(`docker stop ${CONTAINER_NAME}`, { stdio: 'ignore' })
  } catch {}
  containerProcess?.kill()
})

// =========================================================================
// Full e2e: Gemini native SDK → real MCP server → validate model sees screen
// =========================================================================
test('Google native SDK Gemini: full e2e with real MCP computer use server', { timeout: 300_000 }, async () => {
  const prisma = new PrismaClient()
  const mcpClient = new McpClient(MCP_SERVER_URL)
  await mcpClient.initialize()

  // Trigger browser launch and wait for defaultUrl to load
  await mcpClient.warmUp()

  const google = new GoogleGenAI({ apiKey: googleApiKey })

  const client = supercompat({
    client: googleClientAdapter({ google }),
    storage: prismaStorageAdapter({ prisma }),
    runAdapter: completionsRunAdapter(),
  })

  const assistant = await client.beta.assistants.create({
    model: 'gemini-3-flash-preview',
    instructions: 'You are a computer use assistant. A browser is already open with a page loaded. Start by taking a screenshot to see the current state. Describe the page title or main content you observe.',
    tools,
  })

  const thread = await prisma.thread.create({
    data: { assistantId: assistant.id },
  })

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Take a screenshot and tell me what website or page you see on the screen.',
  })

  let run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
    tools,
  })

  console.log('Google native Step 1 - Run status:', run.status)

  let iterations = 0
  while (run.status === 'requires_action' && iterations < 15) {
    iterations++
    const toolCalls = run.required_action?.submit_tool_outputs.tool_calls ?? []
    console.log(`Google native Iteration ${iterations} - Tool calls:`, toolCalls.length)

    const toolOutputs = []
    for (const tc of toolCalls) {
      const action = (tc as any).computer_call?.action ?? JSON.parse((tc as any).function?.arguments ?? '{}').action
      console.log(`  Action: ${JSON.stringify(action)}`)

      const output = await executeComputerCall(mcpClient, action)
      const outputPreview = output.length > 200 ? output.slice(0, 100) + '...' : output
      console.log(`  Output: ${outputPreview}`)

      toolOutputs.push({
        tool_call_id: tc.id,
        output,
      })
    }

    run = await client.beta.threads.runs.submitToolOutputsAndPoll(run.id, {
      thread_id: thread.id,
      tool_outputs: toolOutputs,
    })
    console.log(`Google native Iteration ${iterations} - Status after submit:`, run.status)
  }

  assert.notEqual(run.status, 'failed', `Run should not fail (was: ${JSON.stringify(run.last_error)})`)
  assert.equal(run.status, 'completed', `Expected completed, got ${run.status}`)

  // Validate model actually described what it saw on supercorp.ai
  const messages = await client.beta.threads.messages.list(thread.id)
  const assistantMessages = messages.data.filter((m) => m.role === 'assistant')
  const textMessage = assistantMessages.find((m) => {
    const text = (m.content[0] as any)?.text?.value ?? ''
    return text.length > 0
  })
  const text = (textMessage?.content[0] as any)?.text?.value ?? ''
  console.log('Google native final response:', text.slice(0, 500))

  const lower = text.toLowerCase()
  const seesPage = lower.includes('supercorp') || lower.includes('accelerat') || lower.includes('ai agent')
  assert.ok(seesPage, `Model should mention supercorp.ai content (got: "${text.slice(0, 300)}")`)

  await prisma.$disconnect()
})
