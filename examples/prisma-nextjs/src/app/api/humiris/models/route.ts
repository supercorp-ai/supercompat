import OpenAI from 'openai'
import { NextResponse } from 'next/server'
import {
  supercompat,
  humirisClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from 'supercompat'
import { prisma } from '@/lib/prisma'

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

  const response = await client.models.list()

  const models = []

  for await (const model of response) {
    models.push(model)
  }

  return NextResponse.json({
    models,
  })
}
