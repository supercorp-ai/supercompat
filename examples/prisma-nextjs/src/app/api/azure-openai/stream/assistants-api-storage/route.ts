import OpenAI, { AzureOpenAI } from 'openai'
import { NextResponse } from 'next/server'
import {
  supercompat,
  azureOpenaiClientAdapter,
} from 'supercompat'

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
  const client = supercompat({
    client: azureOpenaiClientAdapter({
      azureOpenai: new AzureOpenAI({
        endpoint: process.env.EXAMPLE_AZURE_OPENAI_ENDPOINT,
        apiVersion: '2024-09-01-preview',
        fetch: (url: RequestInfo, init?: RequestInit): Promise<Response> => (
          fetch(url, {
            ...(init || {}),
            cache: 'no-store',
            // @ts-ignore-next-line
            duplex: 'half',
          })
        ),
      }),
    }),
  })

  const assistantId = 'asst_ZrKBc3znUGrm6L0cKzSpfqXG'

  const thread = await client.beta.threads.create({
    messages: [],
    metadata: {
      assistantId,
    },
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
      model: 'gpt-4o-mini',
      stream: true,
      tools,
      truncation_strategy: {
        type: 'last_messages',
        last_messages: 10,
      },
    },
  )

  let requiresActionEvent

  let lastEvent

  for await (const event of run) {
    if (event.event === 'thread.run.requires_action') {
      requiresActionEvent = event
    }
    lastEvent = event
  }

  if (!requiresActionEvent) {
    console.dir({ lastEvent }, { depth: null })
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
