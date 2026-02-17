import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import OpenAI from 'openai'
import { PrismaClient } from '@prisma/client'
import { HttpsProxyAgent } from 'https-proxy-agent'
import {
  supercompat,
  openRouterClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from '../src/index.ts'

const openrouterApiKey = process.env.OPENROUTER_API_KEY

if (!openrouterApiKey) {
  throw new Error('OPENROUTER_API_KEY is required to run this test')
}

const MODEL = 'google/gemini-3-flash-preview'

function makeOpenRouter() {
  return new OpenAI({
    apiKey: openrouterApiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })
}

// =========================================================================
// Thread/run with computer_use_preview tool — should produce valid action
// =========================================================================
test('openRouter: thread/run with computer_use_preview produces valid computer_call action', async () => {
  const prisma = new PrismaClient()

  const client = supercompat({
    client: openRouterClientAdapter({ openRouter: makeOpenRouter() }),
    storage: prismaStorageAdapter({ prisma }),
    runAdapter: completionsRunAdapter(),
  })

  const tools = [
    {
      type: 'computer_use_preview',
      computer_use_preview: {
        display_width: 1280,
        display_height: 720,
      },
    },
  ] as any[]

  const assistant = await client.beta.assistants.create({
    model: MODEL,
    instructions: 'You are a computer use assistant. When asked to take a screenshot, use the computer_call tool with action type "screenshot". Always use the tool.',
    tools,
  })

  const thread = await prisma.thread.create({
    data: { assistantId: assistant.id },
  })

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Take a screenshot please.',
  })

  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
    tools,
  })

  console.log('Run status:', run.status)

  if (run.status === 'requires_action') {
    const toolCalls = run.required_action?.submit_tool_outputs.tool_calls ?? []
    console.log('Tool calls:', JSON.stringify(toolCalls, null, 2))

    // Find the computer_call tool call
    const computerCall = toolCalls.find((tc: any) => tc.type === 'computer_call')

    if (computerCall) {
      console.log('computer_call found:', JSON.stringify(computerCall, null, 2))
      const action = (computerCall as any).computer_call?.action
      console.log('action:', JSON.stringify(action))

      // THIS IS THE BUG: action should have a type, but it's {}
      assert.ok(action, 'action should exist')
      assert.ok(action.type, `action.type should be a string, got: ${JSON.stringify(action)}`)
    } else {
      // It might come as a function call instead
      const fnCall = toolCalls.find((tc: any) => tc.function?.name === 'computer_call')
      if (fnCall) {
        console.log('computer_call came as function call:', JSON.stringify(fnCall, null, 2))
        const args = JSON.parse(fnCall.function.arguments)
        console.log('parsed arguments:', JSON.stringify(args, null, 2))
        assert.ok(args.action, 'action should exist in arguments')
        assert.ok(args.action.type, `action.type should exist, got: ${JSON.stringify(args.action)}`)
      } else {
        console.log('All tool calls:', JSON.stringify(toolCalls, null, 2))
        assert.fail('No computer_call tool call found')
      }
    }
  } else if (run.status === 'completed') {
    // Model didn't use the tool - check what it said
    const list = await client.beta.threads.messages.list(thread.id)
    const assistantMessage = list.data.filter((m) => m.role === 'assistant').at(-1)
    console.log('Model completed without tool call. Response:', JSON.stringify(assistantMessage?.content))
    assert.fail('Expected requires_action but got completed')
  } else {
    assert.fail(`Unexpected run status: ${run.status}`)
  }

  await prisma.$disconnect()
})
