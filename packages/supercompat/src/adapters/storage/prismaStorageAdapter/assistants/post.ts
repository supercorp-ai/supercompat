import type { PrismaClient } from '@prisma/client'
import { serializeAssistant } from './serializeAssistant'

export const post = ({ prisma }: { prisma: PrismaClient }) =>
  async (_url: string, options: RequestInit & { body?: string }) => {
    if (!options.body) {
      throw new Error('Request body is required')
    }

    const body = JSON.parse(options.body)
    const { model, instructions, name, description, metadata } = body

    const assistant = await prisma.assistant.create({
      data: {
        modelSlug: model,
        instructions,
        name: name ?? null,
        description: description ?? null,
        metadata: metadata ?? {},
      },
    })

    return new Response(JSON.stringify(
      serializeAssistant({ assistant }),
    ), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
