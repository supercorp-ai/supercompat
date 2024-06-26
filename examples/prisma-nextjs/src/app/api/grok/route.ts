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

export const GET = async () => {
  // console.log("start")

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

  const chatCompletion = await client.chat.completions.create({
    messages: [{ role: 'user', content: 'Say this is a test' }],
    model: 'gpt-3.5-turbo',
    stream: true,
    // model: 'llama3-8b-8192',
  })

  // const newCl = new OpenAI({
  //   apiKey: process.env.OPENAI_API_KEY!,
  // })
  //
  // const chatCompletion2 = await newCl.chat.completions.create({
  //   messages: [{ role: 'user', content: 'Say this is a test' }],
  //   model: 'gpt-3.5-turbo',
  //   stream: true,
  //   // model: 'llama3-8b-8192',
  // })
  //
  //
  // console.dir({
  //   before: 1, chatCompletion,
  // }, { depth: null })
  console.log({ before: chatCompletion })
  for await (const chunk of chatCompletion) {
    console.dir({ chunk }, { depth: null })
  }
  console.log({ after: chatCompletion })
  // console.dir({ chatCompletion }, { depth: null })

  // console.dir({ chatCompletion, chatCompletion2 }, { depth: null })
  return NextResponse.json({
    success: false,
  })
    // (...args) => {
    //   console.dir({ args }, { depth: null })
    //   return fetch(...args)
    // },

  // const client = supercompat({
  //   client: new Groq(),
  //   storage: prismaStorageAdapter({
  //     prisma,
  //   }),
  //   runAdapter: completionsRunAdapter({
  //     messagesHistoryLength: 10,
  //   }),
  // })

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

  await client.beta.threads.runs.createAndPoll(
    thread.id,
    {
      assistant_id: assistantId,
      instructions: 'Just reply',
      // model: 'llama3-8b-8192',
      model: 'gpt-3.5-turbo',
    },
  )

  const threadMessages = await client.beta.threads.messages.list(thread.id, { limit: 10 })

  console.dir({
    threadMessages,
  }, { depth: null })

  return NextResponse.json({
    success: true,
  })
}
