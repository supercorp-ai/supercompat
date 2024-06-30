import type OpenAI from 'openai'
import { NextResponse } from 'next/server'
import {
  supercompat,
  groqClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from 'supercompat'
import Groq from 'groq-sdk'
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
    client: groqClientAdapter({
      groq: new Groq(),
    }),
    storage: prismaStorageAdapter({
      prisma,
    }),
    runAdapter: completionsRunAdapter(),
  })

  const assistantId = 'b7fd7a65-3504-4ad3-95a0-b83a8eaff0f3'

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

  const run = await client.beta.threads.runs.createAndPoll(
    thread.id,
    {
      assistant_id: assistantId,
      instructions: 'Use the get_current_weather and then answer the message.',
      model: 'llama3-8b-8192',
      tools,
      truncation_strategy: {
        type: 'last_messages',
        last_messages: 10,
      },
    },
  )

  if (!run.required_action) {
    throw new Error('No requires action event')
  }

  const toolCallId = run.required_action.submit_tool_outputs.tool_calls[0].id

  await client.beta.threads.runs.submitToolOutputs(
    thread.id,
    run.id,
    {
      tool_outputs: [
        {
          tool_call_id: toolCallId,
          output: '70 degrees and sunny.',
        },
      ],
    }
  )

  await new Promise(r => setTimeout(r, 5000))

  const threadMessages = await client.beta.threads.messages.list(thread.id, { limit: 10 })

  return NextResponse.json({
    threadMessages,
  })
}
