import OpenAI, { AzureOpenAI } from 'openai'
import { NextResponse } from 'next/server'
import {
  supercompat,
  azureAgentsStorageAdapter,
  azureAiProjectsClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from 'supercompat'
import { prisma } from '@/lib/prisma'
import type {
  MessageDeltaChunk,
  MessageDeltaTextContent,
  MessageTextContentOutput,
} from '@azure/ai-projects'
import {
  AIProjectsClient,
  DoneEvent,
  ErrorEvent,
  isOutputOfType,
  MessageStreamEvent,
  RunStreamEvent,
  ToolUtility,
} from '@azure/ai-projects'
import { DefaultAzureCredential } from '@azure/identity'
// import { ClientSecretCredential } from "@azure/identity"

const tools = [
  {
    "type": "function",
    "function": {
      "name": "get_current_weather",
      "description": "Get the current weather in a given location",
      "parameters": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "The city and state, e.g. San Francisco, CA",
          },
          "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]},
        },
        "required": ["location"],
      },
    }
  }
] as OpenAI.Beta.AssistantTool[]

export const GET = async () => {
  const connectionString = 'eastus.api.azureml.ms;8b79ab48-db1f-4bcb-8791-1c49a8f283ef;rg-domas_ai;project-demo-gahp'

  const tenantId = ''
  const clientId = ''
  const clientSecret = ''

  const azureAiProjectsClient = AIProjectsClient.fromConnectionString(
    connectionString,
    new DefaultAzureCredential(),
    // new ClientSecretCredential(tenantId, clientId, clientSecret),
  )

  const client = supercompat({
    client: azureAiProjectsClientAdapter({
      azureAiProjectsClient,
    }),
    storage: azureAgentsStorageAdapter({
      azureAiProjectsClient,
    }),
    runAdapter: completionsRunAdapter(),
  })

  const assistantId = 'asst_OzxiYYIcm8IWCcdETy7WD2Of'

  const thread = await client.beta.threads.create({
    messages: [],
  })

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is the weather in SF?'
  })

  const run = await client.beta.threads.runs.create(
    thread.id,
    {
      assistant_id: assistantId,
      instructions: 'Use the get_current_weather and then answer the message.',
      model: 'gpt-4o',
      stream: true,
      tools,
      truncation_strategy: {
        type: 'last_messages',
        last_messages: 10,
      },
    },
  )

  let requiresActionEvent

  for await (const event of run) {
    if (event.event === 'thread.run.requires_action') {
      requiresActionEvent = event
    }
  }

  if (!requiresActionEvent) {
    throw new Error('No requires action event')
  }

  const toolCallId = requiresActionEvent.data.required_action?.submit_tool_outputs.tool_calls[0].id

  const submitToolOutputsRun = await client.beta.threads.runs.submitToolOutputs(
    thread.id,
    requiresActionEvent.data.id,
    {
      stream: true,
      tool_outputs: [
        {
          tool_call_id: toolCallId,
          output: '70 degrees and sunny.',
        },
      ],
    }
  )

  for await (const _event of submitToolOutputsRun) {
  }

  const threadMessages = await client.beta.threads.messages.list(thread.id, { limit: 10 })

  return NextResponse.json({
    threadMessages,
  })
}
