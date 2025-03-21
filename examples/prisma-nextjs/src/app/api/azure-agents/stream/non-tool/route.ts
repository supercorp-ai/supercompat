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

  // const thread = await azureAiProjectsClient.agents.createThread()

  const client = supercompat({
    client: azureAiProjectsClientAdapter({
      azureAiProjectsClient,
      // azureOpenai: new AzureOpenAI({
      //   endpoint: process.env.EXAMPLE_AZURE_OPENAI_ENDPOINT,
      //   apiVersion: '2024-09-01-preview',
      // }),
    }),
    storage: azureAgentsStorageAdapter({
      azureAiProjectsClient,
    }),
    runAdapter: completionsRunAdapter(),
  })
  console.log({ client })

  //
  const assistantId = 'asst_OzxiYYIcm8IWCcdETy7WD2Of'

  const thread = await client.beta.threads.create({
    messages: [],
    // metadata: {
    //   assistantId,
    // },
  })

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is the weather in SF?'
  })

  const run = await client.beta.threads.runs.create(
    thread.id,
    {
      assistant_id: assistantId,
      instructions: 'Answer the message.',
      model: 'gpt-4o',
      stream: true,
      tools: [],
      truncation_strategy: {
        type: 'last_messages',
        last_messages: 10,
      },
    },
  )

  for await (const _event of run) {
  }

  const threadMessages = await client.beta.threads.messages.list(thread.id, { limit: 10 })

  return NextResponse.json({
    threadMessages,
  })
}
