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
  const client = supercompat({
    client: groqClientAdapter({
      groq: new Groq(),
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
