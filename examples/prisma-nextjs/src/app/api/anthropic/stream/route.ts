import type OpenAI from 'openai'
import { NextResponse } from 'next/server'
import {
  supercompat,
  anthropicClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from 'supercompat'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'

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
    client: anthropicClientAdapter({
      anthropic: new Anthropic(),
    }),
    storage: prismaStorageAdapter({
      prisma,
    }),
    runAdapter: completionsRunAdapter(),
  })

  const assistantId = 'b7fd7a65-3504-4ad3-95a0-b83a8eaff0f3'

  const thread = await client.beta.threads.create({
    messages: [
      {
        role: 'assistant',
        content: '\n\n'
      },
      {
        role: 'assistant',
        content: ''
      },
      {
        role: 'assistant',
        content: 'What is the weather in San Francisco, CA? In celsius.'
      },
      {
        role: 'assistant',
        content: 'What is the weather in San Francisco, CA? In celsius.'
      },
    ],
    metadata: {
      assistantId,
    },
  })

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: [{
      type: 'text',
      text: 'What is the weather in SF? Use get_current_weather',
    }],
  })

  const run = await client.beta.threads.runs.create(
    thread.id,
    {
      assistant_id: assistantId,
      instructions: 'Use the get_current_weather and then answer the message.',
      model: 'claude-3-5-sonnet-20240620',
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
    requiresActionEvent.data.id,
    {
      thread_id: thread.id,
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
