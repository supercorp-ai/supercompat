import OpenAI from 'openai'
import { NextResponse } from 'next/server'
import {
  supercompat,
  openaiClientAdapter,
  responsesRunAdapter,
  prismaStorageAdapter,
} from 'supercompat'
import { prisma } from '@/lib/prisma'

const tools = [
  {
    type: 'function',
    function: {
      name: 'get_current_weather',
      description: 'Get the current weather in a given location',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'The city and state, e.g. San Francisco, CA',
          },
          unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
        },
        required: ['location'],
      },
    },
  },
] as OpenAI.Beta.AssistantTool[]

export const GET = async () => {
  const openai = new OpenAI({
    apiKey: process.env.RENAMED_OPENAI_API_KEY!,
  })

  const client = supercompat({
    client: openaiClientAdapter({ openai }),
    storage: prismaStorageAdapter({ prisma }),
    runAdapter: responsesRunAdapter(),
  })

  const assistant = await client.beta.assistants.create({
    model: 'gpt-4o',
    instructions: 'You are a helpful assistant.',
    tools,
  })

  const thread = await client.beta.threads.create()

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is the weather in SF?'
  })

  const run = await client.beta.threads.runs.create(
    thread.id,
    {
      assistant_id: assistant.id,
      stream: true,
      instructions: 'Use the get_current_weather and then answer the message.',
      model: 'gpt-4o',
      tools,
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

  const submit = await client.beta.threads.runs.submitToolOutputs(
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
    },
  )

  for await (const _event of submit) {
  }

  const threadMessages = await client.beta.threads.messages.list(thread.id, { limit: 10 })

  return NextResponse.json({
    threadMessages,
  })
}
