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

  const threadId = '1ea8b616-fcec-4f0c-a3cb-9df81b67a241'
  const threadMessages = await client.beta.threads.messages.list(threadId, { limit: 10 })

  const hasNextPage = threadMessages.hasNextPage()

  return NextResponse.json({
    threadMessages,
    hasNextPage,
  })
}
