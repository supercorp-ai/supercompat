import type OpenAI from 'openai'
import type { PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'
import { assign } from 'radash'
import { serializeRun } from './serializeRun'
import { RunAdapter } from '@/types'
import { onEvent } from './onEvent'
import { getMessages } from './getMessages'

export const create = ({
  prisma,
  runAdapter,
}: {
  prisma: PrismaClient
  runAdapter: RunAdapter
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
    response_format,
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

  const data = serializeRun({ run })

  new ReadableStream({
    async start(controller) {
      runAdapter({
        run: data,
        onEvent: onEvent({ controller, prisma }),
        getMessages: getMessages({ prisma, run }),
        responseFormat: response_format,
      })
    }
  })

  return data
}
