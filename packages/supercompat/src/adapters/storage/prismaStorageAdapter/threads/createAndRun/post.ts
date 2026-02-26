import type OpenAI from 'openai'
import type { Prisma, PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'
import { assign } from 'radash'
import { serializeRun } from '../runs/serializeRun'
import { RunAdapterPartobClient } from '@/types'
import { onEvent } from '../runs/onEvent'
import { getMessages } from '../runs/getMessages'
import type { Run } from '@/types/prisma'

export const post = ({
  prisma,
  runAdapter,
}: {
  prisma: PrismaClient
  runAdapter: RunAdapterPartobClient
}) => async (_urlString: string, options: RequestInit & { body?: string }) => {
  if (!options.body) {
    throw new Error('No body provided')
  }

  const body = JSON.parse(options.body)
  const { assistant_id, stream, thread: threadParams } = body

  const assistant = await prisma.assistant.findUnique({
    where: { id: assistant_id },
  })

  if (!assistant) {
    throw new Error('Assistant not found')
  }

  // Create thread
  const messages = (threadParams?.messages || []) as OpenAI.Beta.ThreadCreateParams.Message[]
  const threadMetadata = threadParams?.metadata || {}

  const initialCreatedAt = dayjs().subtract(messages.length, 'seconds')

  const messageData = messages.map((message, index) => ({
    role: message.role === 'user' ? 'USER' : 'ASSISTANT',
    content: [
      {
        type: 'text',
        text: {
          annotations: [],
          value: message.content,
        },
      },
    ] as Prisma.InputJsonValue,
    attachments: (message.attachments ?? []) as Prisma.InputJsonValue[],
    metadata: message.metadata as Prisma.InputJsonValue | undefined,
    createdAt: initialCreatedAt.add(index, 'seconds').toDate(),
  }))

  const createdThread = await prisma.thread.create({
    data: {
      metadata: threadMetadata as Prisma.InputJsonValue,
      assistant: { connect: { id: assistant_id } },
      messages: { create: messageData },
    },
  })

  // Create run
  const {
    model,
    instructions,
    tools,
    metadata,
    response_format,
    truncation_strategy,
  } = assign({
    model: assistant.modelSlug,
    instructions: '',
    truncation_strategy: { type: 'auto' },
    response_format: { type: 'text' },
  }, body)

  const run = await prisma.run.create({
    data: {
      status: 'QUEUED',
      expiresAt: dayjs().add(1, 'hour').unix(),
      model,
      instructions,
      tools,
      metadata,
      thread: { connect: { id: createdThread.id } },
      assistant: { connect: { id: assistant_id } },
      truncationStrategy: truncation_strategy,
      responseFormat: response_format,
    },
  }) as Run

  const data = serializeRun({ run })

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        await runAdapter.handleRun({
          run: data,
          onEvent: onEvent({
            controller: {
              ...controller,
              enqueue: (data) => {
                controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
              },
            },
            prisma,
          }),
          getMessages: getMessages({
            prisma,
            run,
          }),
        })
      } catch (error: any) {
        console.error(error)

        onEvent({
          controller: {
            ...controller,
            enqueue: (data) => {
              controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
            },
          },
          prisma,
        })({
          event: 'thread.run.failed',
          data: {
            id: run.id,
            failed_at: dayjs().unix(),
            last_error: {
              code: 'server_error',
              message: `${error?.message ?? ''} ${error?.cause?.message ?? ''}`,
            },
          },
        } as OpenAI.Beta.AssistantStreamEvent.ThreadRunFailed)
      }

      controller.close()
    },
  })

  if (stream) {
    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
      },
    })
  } else {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
}
