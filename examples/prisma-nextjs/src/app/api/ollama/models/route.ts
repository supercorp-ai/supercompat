import OpenAI from 'openai'
import { NextResponse } from 'next/server'
import {
  supercompat,
  ollamaClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from 'supercompat'
import { prisma } from '@/lib/prisma'

export const GET = async () => {
  const client = supercompat({
    client: ollamaClientAdapter({
      ollama: new OpenAI({
        apiKey: 'ollama',
        baseURL: 'https://7274-209-36-2-102.ngrok-free.app/v1/',
      }),
    }),
    storage: prismaStorageAdapter({
      prisma,
    }),
    runAdapter: completionsRunAdapter(),
  })

  const response = await client.models.list()

  const models = []

  for await (const model of response) {
    models.push(model)
  }

  return NextResponse.json({
    models,
  })
}
