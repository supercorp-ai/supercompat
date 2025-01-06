import OpenAI from 'openai'
import { NextResponse } from 'next/server'
import {
  supercompat,
  openaiClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from 'supercompat'
import { prisma } from '@/lib/prisma'

export const GET = async () => {
  const client = supercompat({
    client: openaiClientAdapter({
      openai: new OpenAI({
        apiKey: process.env.RENAMED_OPENAI_API_KEY!,
      }),
    }),
    storage: prismaStorageAdapter({
      prisma,
    }),
    runAdapter: completionsRunAdapter(),
  })

  const threadId = 'ba31a5eb-b536-4697-bfae-ce627a8a2702'
  const threadMessages = await client.beta.threads.messages.list(threadId, { limit: 10 })

  return NextResponse.json({
    threadMessages,
  })
}
