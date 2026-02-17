import { test } from 'node:test'
import { strict as assert } from 'node:assert'
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

const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? 'http://localhost:3101'

const tools = [
  {
    type: 'computer_use_preview',
    computer_use_preview: {
      display_width: 1280,
      display_height: 720,
    },
  },
] as any[]

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

    // Capture session ID from first response
    const sid = res.headers.get('mcp-session-id')
    if (sid) this.sessionId = sid

    const text = await res.text()
    // SSE format: parse the data line
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

  /** Warm up the browser session — triggers lazy browser launch and waits for defaultUrl to load */
  async warmUp() {
    // First screenshot triggers browser launch + page.goto(defaultUrl)
    await this.callTool('computer_call', { action: { type: 'screenshot' } })
    // Wait for page to fully load (x86 emulation on ARM is slow)
    await new Promise((r) => setTimeout(r, 15000))
    // Take another screenshot to confirm page is loaded
    await this.callTool('computer_call', { action: { type: 'screenshot' } })
  }
}

/** Actions the MCP server actually handles */
const KNOWN_MCP_ACTIONS = new Set([
  'screenshot', 'click', 'double_click', 'triple_click', 'type',
  'keypress', 'scroll', 'move', 'drag', 'wait',
])

/**
 * Execute a computer_call action on the MCP server and return the
 * serialized screenshot output (same format handleComputerCall uses).
 *
 * For Gemini-specific high-level actions (open_web_browser, navigate, etc.)
 * that the MCP server doesn't understand, we fall back to a screenshot so
 * the model can see the current state and proceed with basic actions.
 */
async function executeComputerCall(
  mcpClient: McpClient,
  action: Record<string, any>,
): Promise<string> {
  const effectiveAction = KNOWN_MCP_ACTIONS.has(action?.type)
    ? action
    : { type: 'screenshot' }

  const result = await mcpClient.callTool('computer_call', { action: effectiveAction })

  const content = result.result?.content ?? []
  const imageContent = content.find((c: any) => c.type === 'image')

  if (imageContent) {
    const imageUrl = `data:${imageContent.mimeType};base64,${imageContent.data}`
    return JSON.stringify({
      type: 'computer_screenshot',
      image_url: imageUrl,
    })
  }

  // Fallback: return text content
  const textContent = content.find((c: any) => c.type === 'text')
  return textContent?.text ?? 'No screenshot returned'
}

// =========================================================================
// Full e2e: Gemini native SDK → real MCP server → validate model sees screen
// =========================================================================
test('Google native SDK Gemini: full e2e with real MCP computer use server', { timeout: 120_000 }, async () => {
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
  while (run.status === 'requires_action' && iterations < 5) {
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
