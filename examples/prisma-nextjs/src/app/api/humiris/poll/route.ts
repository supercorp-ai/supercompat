import OpenAI from 'openai'
import { NextResponse } from 'next/server'
import {
  supercompat,
  humirisClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from 'supercompat'
import { prisma } from '@/lib/prisma'

const tools = [] as OpenAI.Beta.AssistantTool[]

export const GET = async () => {
  const client = supercompat({
    client: humirisClientAdapter({
      humiris: new OpenAI({
        apiKey: process.env.HUMIRIS_API_KEY,
        baseURL: 'https://moai-service-app.humiris.ai/api/openai/v1/',
        defaultHeaders: {
          'moai-api-key': process.env.HUMIRIS_API_KEY,
        },
      }),
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
      instructions: 'Answer the message.',
      model: 'Humiris/humiris-moai',
      tools,
      truncation_strategy: {
        type: 'last_messages',
        last_messages: 10,
      },
    },
  )

  await new Promise(r => setTimeout(r, 5000))

  const threadMessages = await client.beta.threads.messages.list(thread.id, { limit: 10 })

  return NextResponse.json({
    threadMessages,
  })
}
