import type OpenAI from 'openai'
import type { PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'
import { assign } from 'radash'
import { serializeRun } from './serializeRun'

export const create = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (...args: Parameters<OpenAI.Beta.Threads.Runs['create']>): Promise<ReturnType<OpenAI.Beta.Threads.Runs['create']>> => {
  const threadId = args[0]
  const { assistant_id } = args[1]

  const assistant = await prisma.assistant.findUnique({
    where: {
      id: assistant_id,
    },
  })

  if (!assistant) {
    throw new Error('Assistant not found')
  }

  const {
    model,
    instructions,
    // additional_instructions,
    tools,
    metadata,
    // @ts-ignore-next-line
  } = assign({
    model: assistant.modelSlug,
    instructions: '',
    additional_instructions: null,
    // tools: [],
    // metadata: {},
  }, args[1])

  const run = await prisma.run.create({
    data: {
      status: 'QUEUED',
      expiresAt: dayjs().add(1, 'hour').unix(),
      // @ts-ignore-next-line
      model,
      // @ts-ignore-next-line
      instructions,
      // @ts-ignore-next-line
      tools,
      // @ts-ignore-next-line
      metadata,
      thread: {
        connect: {
          id: threadId,
        },
      },
      assistant: {
        connect: {
          id: assistant_id,
        },
      },
    },
  })

  return serializeRun({ run })
}
