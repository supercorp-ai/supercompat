import type { PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'

export const post = ({ prisma }: { prisma: PrismaClient }) =>
  async (_url: string, options: RequestInit & { body?: string }) => {
    const body = JSON.parse(options.body || '{}')
    const { model, instructions } = body

    const assistant = await prisma.assistant.create({
      data: { modelSlug: model, instructions },
    })

    const data = {
      id: assistant.id,
      object: 'assistant',
      created_at: dayjs().unix(),
      name: null,
      description: null,
      model,
      instructions,
      tools: [],
      metadata: {},
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
