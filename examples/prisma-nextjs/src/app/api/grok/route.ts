import OpenAI from 'openai'
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
];

export const GET = async () => {
  const client = new OpenAI({
    apiKey: 'SUPERCOMPAT_PLACEHOLDER_OPENAI_KEY',
    fetch: supercompat({
      // client: groqClientAdapter({
      //   groq: new Groq(),
      // }),
      client: groqClientAdapter({
        groq: new OpenAI({
          apiKey: process.env.OPENAI_API_KEY!,
        }),
      }),
      storage: prismaStorageAdapter({
        prisma,
      }),
      runAdapter: completionsRunAdapter({
        messagesHistoryLength: 10,
      }),
    }),
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
    content: 'Who won the world series in 2020?'
  })

  const ru = await client.beta.threads.runs.create(
    thread.id,
    {
      assistant_id: assistantId,
      instructions: 'Use the get_current_weather and then answer the message. Look up weather and disregard the rest.',
      // model: 'llama3-8b-8192',
      stream: true,
      tools,
      model: 'gpt-3.5-turbo',
    },
  )

  let requiresActionEvent

  for await (const event of ru) {
    if (event.event === 'thread.run.requires_action') {
      requiresActionEvent = event
    }
  }

  console.dir({ requiresActionEvent })
  if (!requiresActionEvent) {
    throw new Error('No requires action event')
  }

  const run = await client.beta.threads.runs.submitToolOutputs(
    thread.id,
    requiresActionEvent.data.id,
    {
      stream: true,
      tool_outputs: [
        {
          tool_call_id: "call_001",
          output: "70 degrees and sunny.",
        },
      ],
    }
  );
  //
  // for await (const event of run) {
  //   console.dir({ event }, { depth: null })
  // }

  const threadMessages = await client.beta.threads.messages.list(thread.id, { limit: 10 })

  return NextResponse.json({
    threadMessages,
  })


  // await client.beta.threads.runs.createAndPoll(
  //   thread.id,
  //   {
  //     assistant_id: assistantId,
  //     instructions: 'Just reply',
  //     model: 'llama3-8b-8192',
  //     // model: 'gpt-3.5-turbo',
  //   },
  // )
  //
  // const threadMessages = await client.beta.threads.messages.list(thread.id, { limit: 10 })
  //
  // const runs = await client.beta.threads.runs.list(thread.id)
  // const last = runs.data[runs.data.length - 1]
  // console.dir({last}, { depth: null })
  // const steps = await client.beta.threads.runs.steps.list(thread.id, last.id)
  // console.dir({steps}, { depth: null })
  //
  // return NextResponse.json({
  //   threadMessages,
  // })
}
