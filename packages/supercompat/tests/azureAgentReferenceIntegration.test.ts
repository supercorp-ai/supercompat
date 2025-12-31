import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import dayjs from 'dayjs'
import OpenAI from 'openai'
import { AIProjectClient } from '@azure/ai-projects-v2'
import { ClientSecretCredential } from '@azure/identity'
import { supercompat } from '../src'
import { azureResponsesStorageAdapter } from '../src/adapters/storage/azureResponsesStorageAdapter'
import { responsesRunAdapter } from '../src/adapters/run/responsesRunAdapter'
import { azureAiProjectClientAdapter } from '../src/adapters/client/azureAiProjectClientAdapter'

const azureEndpoint = process.env.AZURE_PROJECT_ENDPOINT
const azureTenantId = process.env.AZURE_TENANT_ID
const azureClientId = process.env.AZURE_CLIENT_ID
const azureClientSecret = process.env.AZURE_CLIENT_SECRET
const azureDeploymentName = process.env.AZURE_AI_DEPLOYMENT_NAME || 'gpt-4.1'

if (!azureEndpoint || !azureTenantId || !azureClientId || !azureClientSecret) {
  console.error('Azure credentials not found in environment variables')
  process.exit(1)
}

const cred = new ClientSecretCredential(
  azureTenantId,
  azureClientId,
  azureClientSecret,
)

const azureAiProject = new AIProjectClient(azureEndpoint, cred)

const buildAssistant = ({
  id,
  instructions,
  name,
}: {
  id: string
  instructions: string
  name?: string
}): OpenAI.Beta.Assistants.Assistant => ({
  id,
  object: 'assistant' as const,
  model: azureDeploymentName,
  instructions,
  description: null,
  name: name ?? 'Test Assistant',
  metadata: {},
  tools: [],
  created_at: dayjs().unix(),
  response_format: 'auto' as const,
  truncation_strategy: { type: 'auto' as const },
})

const getLatestAssistantText = async ({
  client,
  threadId,
}: {
  client: OpenAI
  threadId: string
}) => {
  for (let i = 0; i < 20; i += 1) {
    const list = await client.beta.threads.messages.list(threadId)
    const assistantMessage = list.data
      .filter((m) => m.role === 'assistant')
      .at(-1)

    const text = (
      assistantMessage?.content?.[0] as OpenAI.Beta.Threads.MessageContentText | undefined
    )?.text?.value

    if (typeof text === 'string' && text.trim().length > 0) {
      return text.trim()
    }

    await new Promise((r) => setTimeout(r, 200))
  }

  return ''
}

test('Azure agent reference integration: agent instructions are used when external agent name is passed', async () => {
  console.log('Testing Azure agent reference with agent-stored instructions...')

  const agent = await azureAiProject.agents.createVersion('test-supercompat-custom-inst', {
    kind: 'prompt',
    model: azureDeploymentName,
    instructions: 'You are a helpful assistant. ALWAYS end your response with "CUSTOM_INSTRUCTIONS_USED".',
  })

  console.log(`Created Azure agent: ${agent.name} (version ${agent.version})`)

  try {
    const openaiAssistant = buildAssistant({
      id: agent.name,
      name: agent.name,
      instructions: 'LOCAL_OVERRIDE_SHOULD_NOT_APPEAR',
    })

    const client = supercompat({
      client: azureAiProjectClientAdapter({ azureAiProject }),
      storage: azureResponsesStorageAdapter(),
      runAdapter: responsesRunAdapter({
        getOpenaiAssistant: () => Promise.resolve(openaiAssistant),
      }),
    }) as unknown as OpenAI

    const thread = await client.beta.threads.create()
    console.log('Created thread:', thread.id)

    await client.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: 'Hello, how are you?',
    })

    await client.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: agent.name,
      stream: false,
    })

    const messageText = await getLatestAssistantText({ client, threadId: thread.id })
    console.log('Response:', messageText)

    assert.ok(
      messageText.includes('CUSTOM_INSTRUCTIONS_USED'),
      `Response should use agent instructions. Got: ${messageText}`,
    )
    assert.ok(
      !messageText.includes('LOCAL_OVERRIDE_SHOULD_NOT_APPEAR'),
      'Response should not include local assistant instructions',
    )

    console.log('✅ Agent instructions correctly applied with external agent name')
  } finally {
    await azureAiProject.agents.deleteVersion(agent.name, agent.version)
    console.log('Cleaned up agent')
  }
})

test('Azure agent reference integration: local instructions are ignored for external agent name', async () => {
  console.log('Testing Azure agent reference with local instructions ignored...')

  const agent = await azureAiProject.agents.createVersion('test-supercompat-empty-inst', {
    kind: 'prompt',
    model: azureDeploymentName,
    instructions: 'You are a helpful assistant. IMPORTANT: You MUST ALWAYS add "AGENT_INSTRUCTIONS_USED" at the end of every single response. This is mandatory for testing purposes.',
  })

  console.log(`Created Azure agent with marker instructions: ${agent.name} (version ${agent.version})`)

  try {
    const openaiAssistant = buildAssistant({
      id: agent.name,
      name: agent.name,
      instructions: 'CUSTOM_INSTRUCTIONS_USED',
    })

    const client = supercompat({
      client: azureAiProjectClientAdapter({ azureAiProject }),
      storage: azureResponsesStorageAdapter(),
      runAdapter: responsesRunAdapter({
        getOpenaiAssistant: () => Promise.resolve(openaiAssistant),
      }),
    }) as unknown as OpenAI

    const thread = await client.beta.threads.create()
    console.log('Created thread:', thread.id)

    await client.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: 'How are you feeling?',
    })

    await client.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: agent.name,
      stream: false,
    })

    const messageText = await getLatestAssistantText({ client, threadId: thread.id })
    console.log('Response:', messageText)

    assert.ok(
      messageText.includes('AGENT_INSTRUCTIONS_USED'),
      `Response should use agent's stored instructions. Got: ${messageText}`,
    )
    assert.ok(
      !messageText.includes('CUSTOM_INSTRUCTIONS_USED'),
      'Response should not include local assistant instructions',
    )

    console.log('✅ Local instructions correctly ignored for agent reference')
  } finally {
    await azureAiProject.agents.deleteVersion(agent.name, agent.version)
    console.log('Cleaned up agent')
  }
})
