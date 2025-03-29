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
  const runId = '776fb850-d517-472a-85cc-49faa06b01c7'
  // const threadMessages = await client.beta.threads.messages.list(threadId, { limit: 10 })
  const runStepsResponse = await client.beta.threads.runs.steps.list(
    threadId,
    runId,
  )


  return NextResponse.json({
    runStepsResponse,
  })
}
