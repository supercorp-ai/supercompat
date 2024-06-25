import type OpenAI from 'openai'
import type { PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'
import { assign } from 'radash'
import { serializeRun } from './serializeRun'
import { RunAdapter } from '@/types'
import { onEvent } from './onEvent'
import { getMessages } from './getMessages'

type RunCreateResponse = Response & {
  json: () => Promise<ReturnType<OpenAI.Beta.Threads.Runs['create']>>
}

export const post = ({
  prisma,
  runAdapter,
}: {
  prisma: PrismaClient
  runAdapter: RunAdapter
}) => async (url: string, options: any): Promise<RunCreateResponse> => {
  const [, threadId] = url.match(new RegExp('^https://api.openai.com/v1/threads/([^/]+)/runs'))!

  const body = JSON.parse(options.body)
  const { assistant_id } = body

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
  } = assign({
    model: assistant.modelSlug,
    instructions: '',
    additional_instructions: null,
    // tools: [],
    // metadata: {},
  }, body)

  const run = await prisma.run.create({
    data: {
      status: 'QUEUED',
      expiresAt: dayjs().add(1, 'hour').unix(),
      model,
      instructions,
      tools,
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
        // @ts-ignore-next-line
        getMessages: getMessages({ prisma, run }),
        responseFormat: response_format,
      })
    }
  })

  return new Response(JSON.stringify(
    data
  ), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
