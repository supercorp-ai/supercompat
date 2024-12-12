import { NextResponse } from 'next/server'
import {
  supercompat,
  mistralClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from 'supercompat'
import { Mistral } from '@mistralai/mistralai'
import { prisma } from '@/lib/prisma'

export const GET = async () => {
  const client = supercompat({
    client: mistralClientAdapter({
      mistral: new Mistral({
        apiKey: process.env.MISTRAL_API_KEY,
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
