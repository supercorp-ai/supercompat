import OpenAI from 'openai'
import { NextResponse } from 'next/server'
import {
  supercompat,
  googleClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from 'supercompat'
import { prisma } from '@/lib/prisma'

export const GET = async () => {
  const client = supercompat({
    client: googleClientAdapter({
      google: new OpenAI({
        apiKey: process.env.GOOGLE_API_KEY,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      }),
    }),
    storage: prismaStorageAdapter({
      prisma,
    }),
    runAdapter: completionsRunAdapter(),
  })

  const response = await client.models.list()
  // console.dir({ response }, { depth: null })

  const models = []

  for await (const model of response) {
    models.push(model)
  }

  return NextResponse.json({
    models,
  })
}
