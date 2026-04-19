/**
 * Shared Docker lifecycle helpers for computer-use-mcp containers used in
 * tests. Each caller provides a unique name+port so multiple containers can
 * run in parallel without colliding on Docker resources.
 */
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DOCKER_IMAGE = 'computer-use-mcp-dev'
// 3 minutes — under parallel load (several Chromium containers booting at
// once across different test files) the browser can take 60-120s to open
// its default URL. 3 minutes gives enough headroom while failing fast if
// Docker itself is broken. Combined with concurrency:1 inside each test
// file, we cap total concurrent containers at ~6 (one per running file).
const HEALTH_TIMEOUT_MS = 180_000
const HEALTH_POLL_MS = 1_000
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DOCKER_CONTEXT_DIR = process.env.COMPUTER_USE_MCP_DIR
  ?? path.resolve(__dirname, '../../../../../computer-use-mcp')

let buildPromise: Promise<void> | undefined
// Build the image once per test-runner process, even if multiple tests call
// `startMcpContainer` in parallel. `docker build` with identical tag from
// multiple processes would race.
export function buildImageOnce(): Promise<void> {
  if (process.env.SKIP_DOCKER_BUILD === 'true') return Promise.resolve()
  if (buildPromise) return buildPromise
  buildPromise = (async () => {
    execSync(`docker build --platform=linux/amd64 -t ${DOCKER_IMAGE} .`, {
      cwd: DOCKER_CONTEXT_DIR,
      stdio: 'ignore',
    })
  })()
  return buildPromise
}

function removeContainerIfExists(name: string) {
  try {
    execSync(`docker rm -f ${name}`, { stdio: 'ignore' })
  } catch {
    // not running — fine
  }
}

async function waitForHealth(serverUrl: string): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${serverUrl}/healthz`)
      if (res.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS))
  }
  throw new Error(`Container ${serverUrl} did not become healthy within ${HEALTH_TIMEOUT_MS}ms`)
}

export type McpContainerHandle = {
  serverUrl: string
  stop: () => void
}

export async function startMcpContainer({
  name,
  port,
  displayWidth,
  displayHeight,
  defaultUrl = 'https://supercorp.ai',
}: {
  name: string
  port: number
  displayWidth?: number
  displayHeight?: number
  defaultUrl?: string
}): Promise<McpContainerHandle> {
  await buildImageOnce()
  removeContainerIfExists(name)

  const serverUrl = `http://localhost:${port}`

  const args = [
    'run', '--rm',
    '--name', name,
    '--platform', 'linux/amd64',
    '-p', `${port}:8000`,
    DOCKER_IMAGE,
    '--transport', 'http',
    '--toolSchema', 'loose',
    '--imageOutputFormat', 'openai-responses-api',
    '--defaultUrl', defaultUrl,
  ]
  if (displayWidth != null) args.push('--displayWidth', String(displayWidth))
  if (displayHeight != null) args.push('--displayHeight', String(displayHeight))

  const child: ChildProcess = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] })

  await waitForHealth(serverUrl)

  return {
    serverUrl,
    stop: () => {
      try { execSync(`docker stop ${name}`, { stdio: 'ignore' }) } catch {}
      child.kill()
    },
  }
}

/**
 * JSON-RPC client for the computer-use-mcp server. Thin enough that every
 * test file could inline it — factored out because every test file *does*
 * inline it today and the shape has already drifted between them.
 */
export class McpClient {
  private sessionId: string | null = null

  constructor(private url: string) {}

  private async rpc(method: string, params: Record<string, any> = {}, id: number = 1) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    }
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId

    const res = await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    })

    const sid = res.headers.get('mcp-session-id')
    if (sid) this.sessionId = sid

    const text = await res.text()
    const dataLine = text.split('\n').find((l) => l.startsWith('data: '))
    if (dataLine) return JSON.parse(dataLine.slice(6))
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

/**
 * Decode a `tools/call` response into the same `computer_screenshot`
 * JSON shape that `handleComputerCall` emits.
 */
export async function executeComputerCallAction(
  mcpClient: McpClient,
  action: Record<string, any>,
): Promise<string> {
  const result = await mcpClient.callTool('computer_call', { action })

  const structured = result.result?.structuredContent?.content ?? []
  const imageItem = structured.find((c: any) => c.type === 'input_image' && c.image_url)

  if (imageItem) {
    return JSON.stringify({
      type: 'computer_screenshot',
      image_url: imageItem.image_url,
    })
  }

  const content = result.result?.content ?? []
  const imageContent = content.find((c: any) => c.type === 'image')

  if (imageContent) {
    const imageUrl = `data:${imageContent.mimeType};base64,${imageContent.data}`
    return JSON.stringify({ type: 'computer_screenshot', image_url: imageUrl })
  }

  const textContent = content.find((c: any) => c.type === 'text')
  return textContent?.text ?? 'No screenshot returned'
}
