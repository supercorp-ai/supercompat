import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import {
  supercompat,
  anthropicClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from 'supercompat'
import { prisma } from '@/lib/prisma'

export const GET = async () => {
  const client = supercompat({
    client: anthropicClientAdapter({
      anthropic: new Anthropic(),
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
