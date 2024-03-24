import type { PrismaClient } from '@prisma/client'
import type OpenAI from 'openai'
import { assign } from 'radash'
import dayjs from 'dayjs'
import { serializeRun } from './serializeRun'
import { RunAdapter } from '@/types'
import { onEvent } from './onEvent'
import { getMessages } from './getMessages'

export const createAndStream = ({
  prisma,
  runAdapter,
}: {
  prisma: PrismaClient
  runAdapter: RunAdapter
}) => (...args: Parameters<OpenAI.Beta.Threads.Runs['createAndStream']>): ReturnType<OpenAI.Beta.Threads.Runs['createAndStream']> => {
  return new ReadableStream({
    async start(controller) {
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

      const data = serializeRun({ run })

      controller.enqueue({
        event: 'thread.run.created',
        data,
      })

      console.log('createAndStream', { getMessages })
      // client is partob filled before
      // @ts-ignore-next-line
      await runAdapter({
        run: data,
        onEvent: onEvent({ controller, prisma }),
        getMessages: getMessages({ prisma, run }),
      })

      console.log('Stream ended inside cloud storage')
      controller.close()
    },
  })
}
