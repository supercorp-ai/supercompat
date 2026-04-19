import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import OpenAI from 'openai'
import { PrismaClient } from '@prisma/client'
import { createTestPrisma } from '../../lib/testPrisma'
import {
  supercompat,
  ollamaClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from '../../../src/openai/index'
import { ollamaBaseUrl, skipIfNoModel } from './lib/resolveModel'
import {
  startMcpContainer,
  McpClient,
  executeComputerCallAction,
  type McpContainerHandle,
} from '../../lib/mcpContainer'

// ---------------------------------------------------------------------------
// Ollama configuration — local-first, no API key needed. The model is
// auto-resolved from /v1/models if OLLAMA_MODEL isn't set, so "gemma4:26b"
// vs "gemma4:latest" just works without any env tweaking.
// ---------------------------------------------------------------------------
const ollamaModel = await skipIfNoModel()

function makeOllama() {
  return new OpenAI({ baseURL: ollamaBaseUrl, apiKey: 'ollama' })
}

// Each test owns a container on its own port so the tests can run in
// parallel (describe below sets `concurrency: true`). Ports are static to
// keep the output predictable when debugging.
const PORT_SCREENSHOT = 3110
const PORT_SUBSCRIBE_1280 = 3113
const PORT_SUBSCRIBE_720 = 3111

const tools = [
  {
    type: 'computer_use_preview',
    computer_use_preview: {
      display_width: 1280,
      display_height: 720,
    },
  },
] as any[]

// Local Ollama models are weaker at self-directed tool loops than Anthropic /
// OpenAI computer-use models, so the system prompt is extra-prescriptive.
const SYSTEM_INSTRUCTIONS = `You control a computer via the computer_call tool. You have NO knowledge of what is currently on the screen. The ONLY way to see the screen is by calling computer_call with type "screenshot".

CRITICAL RULES:
1. Your FIRST action in every conversation MUST be a computer_call with type "screenshot".
2. NEVER answer a question without having taken a screenshot first.
3. After every click or keypress, take another screenshot to see the result.
4. Perform exactly ONE action per tool call.
5. Only respond with a final text answer AFTER you have gathered all required information from the screen via screenshots.
6. When you receive a screenshot, ANALYZE it carefully and describe what you see. Do NOT just say "let me take a screenshot" — you already have the screenshot result, so read it.
7. NEVER give a final answer that only says you will take a screenshot. You must actually analyze the screenshot content you received.`

// ---------------------------------------------------------------------------
// Shared test runner — drives the tool-call loop and collects results
// ---------------------------------------------------------------------------

async function runComputerUseLoop({
  client,
  prisma,
  mcpClient,
  instructions,
  userMessage,
  maxIterations = 15,
  testLabel = 'Ollama',
  customTools,
}: {
  client: any
  prisma: PrismaClient
  mcpClient: McpClient
  instructions: string
  userMessage: string
  maxIterations?: number
  testLabel?: string
  customTools?: any[]
}) {
  const useTools = customTools ?? tools

  const assistant = await client.beta.assistants.create({
    model: ollamaModel,
    instructions,
    tools: useTools,
  })

  const thread = await prisma.thread.create({ data: { assistantId: assistant.id } })

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: userMessage,
  })

  let run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
    tools: useTools,
  })

  console.log(`${testLabel} Step 1 - Run status:`, run.status)

  const allActions: string[] = []
  const allCoords: string[] = []
  let iterations = 0

  while (run.status === 'requires_action' && iterations < maxIterations) {
    iterations++
    const toolCalls = run.required_action?.submit_tool_outputs.tool_calls ?? []
    console.log(`${testLabel} Iteration ${iterations} - Tool calls:`, toolCalls.length)

    const toolOutputs = []
    for (const tc of toolCalls) {
      const action = (tc as any).computer_call?.action ?? JSON.parse((tc as any).function?.arguments ?? '{}').action ?? {}
      console.log(`  Action: ${JSON.stringify(action)}`)
      allActions.push(action.type ?? 'unknown')
      if (action.type === 'click') allCoords.push(`(${action.x},${action.y})`)

      const output = await executeComputerCallAction(mcpClient, action)
      const outputPreview = output.length > 200 ? output.slice(0, 100) + '...' : output
      console.log(`  Output: ${outputPreview}`)

      toolOutputs.push({ tool_call_id: tc.id, output })
    }

    run = await client.beta.threads.runs.submitToolOutputsAndPoll(run.id, {
      thread_id: thread.id,
      tool_outputs: toolOutputs,
    })
    console.log(`${testLabel} Iteration ${iterations} - Status after submit:`, run.status)
  }

  console.log('All actions:', allActions.join(' → '))
  if (allCoords.length) console.log('Click coords:', allCoords.join(' → '))

  const messages = await client.beta.threads.messages.list(thread.id)
  const assistantMessages = messages.data.filter((m: any) => m.role === 'assistant')
  // Concatenate every assistant text fragment — some models emit multiple
  // short messages (one per step) instead of a single final message. The
  // earlier `find(length > 10)` pass missed those and returned empty.
  const text = assistantMessages
    .flatMap((m: any) => (m.content ?? []))
    .filter((part: any) => part?.type === 'text')
    .map((part: any) => part.text?.value ?? '')
    .join(' ')
    .trim()
  console.log(`${testLabel} final response:`, text.slice(0, 800))

  return { run, allActions, allCoords, text, iterations }
}

// Helper — run a test with its own MCP container spun up on demand.
async function withContainer<T>(
  opts: { name: string; port: number; displayWidth?: number; displayHeight?: number },
  body: (mcpClient: McpClient) => Promise<T>,
): Promise<T> {
  const container: McpContainerHandle = await startMcpContainer(opts)
  try {
    const mcpClient = new McpClient(container.serverUrl)
    await mcpClient.initialize()
    await mcpClient.warmUp()
    return await body(mcpClient)
  } finally {
    container.stop()
  }
}

// =========================================================================
// Tests run in parallel — each owns its own Docker container on a unique
// port, so they don't contend for browser state.
// =========================================================================
// concurrency:1 — Ollama serves one request at a time (single GPU queue).
// Running gemma tests in parallel buys nothing because they all block on
// the same upstream, and it doubles the wall-time budget we need. Run them
// strictly in series so each test gets Ollama's full attention when the
// rest of the suite isn't starving it.
describe('tests', { concurrency: 1 }, () => {
  test(`Ollama ${ollamaModel}: full e2e with real MCP computer use server`, { timeout: 900_000 }, async () => {
    const prisma = createTestPrisma()

    await withContainer(
      { name: `computer-use-mcp-ollama-screenshot`, port: PORT_SCREENSHOT },
      async (mcpClient) => {
        const client = supercompat({
          clientAdapter: ollamaClientAdapter({ ollama: makeOllama() }),
          storageAdapter: prismaStorageAdapter({ prisma }),
          runAdapter: completionsRunAdapter(),
        })

        const { run, text, iterations } = await runComputerUseLoop({
          client,
          prisma,
          mcpClient,
          instructions: SYSTEM_INSTRUCTIONS,
          userMessage: 'Call the computer_call tool with type "screenshot" to capture the screen. Then tell me: 1) What is the exact URL in the address bar? 2) What is the main heading on the page? 3) List all product names visible on the page.',
          maxIterations: 10,
          testLabel: `${ollamaModel} Screenshot`,
        })

        assert.notEqual(run.status, 'failed', `Run should not fail (was: ${JSON.stringify(run.last_error)})`)
        assert.equal(run.status, 'completed', `Expected completed, got ${run.status}`)
        assert.ok(iterations > 0, 'Model should have called computer_call at least once')

        const lower = text.toLowerCase()
        const seesPage =
          /\bsuper[a-z]+/i.test(text) ||
          /ai-native/i.test(text) ||
          /accelerat/i.test(text)
        assert.ok(seesPage, `Model should mention supercorp.ai content (got: "${text.slice(0, 300)}")`)
      },
    )

    await prisma.$disconnect()
  })

  // Simpler task than "click Subscribe + read modal" — smaller vision models
  // choke on precise coordinate clicking but can reliably scroll and read.
  test(`Ollama ${ollamaModel}: scroll to bottom and describe footer content`, { timeout: 900_000 }, async () => {
    const prisma = createTestPrisma()

    await withContainer(
      { name: `computer-use-mcp-ollama-subscribe-1280`, port: PORT_SUBSCRIBE_1280 },
      async (mcpClient) => {
        const client = supercompat({
          clientAdapter: ollamaClientAdapter({ ollama: makeOllama() }),
          storageAdapter: prismaStorageAdapter({ prisma }),
          runAdapter: completionsRunAdapter(),
        })

        const { run, allActions, text } = await runComputerUseLoop({
          client,
          prisma,
          mcpClient,
          instructions: SYSTEM_INSTRUCTIONS,
          userMessage: 'Follow these steps EXACTLY and stop after step 3. STEP 1: Take a screenshot. STEP 2: Scroll down once (scroll action, direction "down"). STEP 3: Respond with a single short sentence naming ONE product or heading visible on the page (for example, "Superinterface" or "Supermachine"). DO NOT take more screenshots after step 2. DO NOT keep scrolling.',
          maxIterations: 5,
          testLabel: `${ollamaModel} ScrollBottom`,
        })

        // Strict assertions: the run must complete, at least one scroll must
        // round-trip through MCP, and the final answer must mention something
        // that only exists on the rendered supercorp.ai page — proves the
        // model actually saw the screenshots rather than hallucinating.
        assert.notEqual(run.status, 'failed', `Run should not fail (was: ${JSON.stringify(run.last_error)})`)
        assert.equal(run.status, 'completed', `Expected completed, got ${run.status}`)

        const scrollCount = allActions.filter((a) => a === 'scroll').length
        assert.ok(scrollCount >= 1, `Expected at least 1 scroll (got ${scrollCount}). Actions: ${allActions.join(' → ')}`)

        // Real supercorp.ai content markers. Most Supercorp products start
        // with `super` (Superinterface, Supermachine, Supergateway, Superstream,
        // etc.), but the page also features Big-AGI and uses the tagline
        // "Accelerating open-source AI" — any of these proves the model
        // actually saw the screenshot rather than hallucinating.
        const sawPageContent =
          /\bsuper[a-z]+/i.test(text) ||
          /big[-\s]?agi/i.test(text) ||
          /ai[-\s]?native/i.test(text) ||
          /accelerat/i.test(text) ||
          /open[-\s]?source/i.test(text)
        assert.ok(sawPageContent, `Model should mention real supercorp.ai page content (got: "${text.slice(0, 300)}")`)
      },
    )

    await prisma.$disconnect()
  })

  // Same "scroll + describe" task at a smaller display — exercises the
  // coordinate rescaling path (720x500 vs the 1280x720 default).
  test(`Ollama ${ollamaModel}: scroll to bottom and describe footer at 720x500`, { timeout: 900_000 }, async () => {
    const prisma = createTestPrisma()

    await withContainer(
      {
        name: `computer-use-mcp-ollama-subscribe-720`,
        port: PORT_SUBSCRIBE_720,
        displayWidth: 720,
        displayHeight: 500,
      },
      async (mcpClient) => {
        const client = supercompat({
          clientAdapter: ollamaClientAdapter({ ollama: makeOllama() }),
          storageAdapter: prismaStorageAdapter({ prisma }),
          runAdapter: completionsRunAdapter(),
        })

        const { run, allActions, text } = await runComputerUseLoop({
          client,
          prisma,
          mcpClient,
          instructions: SYSTEM_INSTRUCTIONS,
          userMessage: 'Follow these steps EXACTLY and stop after step 3. STEP 1: Take a screenshot. STEP 2: Scroll down once (scroll action, direction "down"). STEP 3: Respond with a single short sentence naming ONE product or heading visible on the page (for example, "Superinterface" or "Supermachine"). DO NOT take more screenshots after step 2. DO NOT keep scrolling.',
          maxIterations: 5,
          testLabel: `${ollamaModel} ScrollBottom 720x500`,
          customTools: [
            {
              type: 'computer_use_preview',
              computer_use_preview: {
                display_width: 720,
                display_height: 500,
              },
            },
          ],
        })

        // Strict assertions: the run must complete, at least one scroll must
        // round-trip through MCP, and the final answer must mention something
        // that only exists on the rendered supercorp.ai page — proves the
        // model actually saw the screenshots rather than hallucinating.
        assert.notEqual(run.status, 'failed', `Run should not fail (was: ${JSON.stringify(run.last_error)})`)
        assert.equal(run.status, 'completed', `Expected completed, got ${run.status}`)

        const scrollCount = allActions.filter((a) => a === 'scroll').length
        assert.ok(scrollCount >= 1, `Expected at least 1 scroll (got ${scrollCount}). Actions: ${allActions.join(' → ')}`)

        // Real supercorp.ai content markers. Most Supercorp products start
        // with `super` (Superinterface, Supermachine, Supergateway, Superstream,
        // etc.), but the page also features Big-AGI and uses the tagline
        // "Accelerating open-source AI" — any of these proves the model
        // actually saw the screenshot rather than hallucinating.
        const sawPageContent =
          /\bsuper[a-z]+/i.test(text) ||
          /big[-\s]?agi/i.test(text) ||
          /ai[-\s]?native/i.test(text) ||
          /accelerat/i.test(text) ||
          /open[-\s]?source/i.test(text)
        assert.ok(sawPageContent, `Model should mention real supercorp.ai page content (got: "${text.slice(0, 300)}")`)
      },
    )

    await prisma.$disconnect()
  })
})
