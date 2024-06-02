import { NextResponse } from 'next/server'
import {
  supercompat,
  prismaStorageAdapter,
  completionsRunAdapter,
} from 'supercompat'
import Groq from 'groq-sdk'
import { prisma } from '@/lib/prisma'

export const GET = async () => {
  // console.log("start")

  const client = supercompat({
    client: new Groq(),
    storage: prismaStorageAdapter({
      prisma,
    }),
    runAdapter: completionsRunAdapter({
      messagesHistoryLength: 10,
    }),
  })

  console.log({
    createAndPoll: client.beta.threads.runs.createAndPoll,
  })

  // console.log({
  //   runs: client.beta.threads.runs,
  // })

  // console.log("client")
  const assistantId = 'b7fd7a65-3504-4ad3-95a0-b83a8eaff0f3'

  const thread = await client.beta.threads.create({
    messages: [],
    metadata: {
      assistantId,
    },
  })


  // console.log("thread")

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Who won the world series in 2020?'
  })

  // console.log("a")
  //
  // console.log({
  //   runs: client.beta.threads.runs,
  // })
  // console.dir({ client }, { depth: null })
  const r = await client.beta.threads.runs.createAndPoll(
    thread.id,
    {
      assistant_id: assistantId,
      instructions: 'Just reply',
      model: 'llama3-8b-8192',
    },
  )

  // console.dir({ r }, { depth: null })

  const threadMessages = await client.beta.threads.messages.list(thread.id)

  return NextResponse.json({
    threadMessages,
  })
}
