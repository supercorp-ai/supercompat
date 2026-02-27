import type { PrismaClient, Prisma } from '@prisma/client'
import dayjs from 'dayjs'
import { onEvent } from '../onEvent'
import { getMessages } from '../getMessages'
import { serializeResponse } from '../../serializers/serializeResponse'
import { RunAdapterPartobClient } from '@/types'

const createTools = async ({
  prisma,
  responseId,
  tools,
}: {
  prisma: PrismaClient
  responseId: string
  tools: any[]
}) => {
  for (const tool of tools) {
    const toolType = (() => {
      switch (tool.type) {
        case 'function': return 'FUNCTION'
        case 'file_search': return 'FILE_SEARCH'
        case 'web_search_preview': return 'WEB_SEARCH'
        case 'code_interpreter': return 'CODE_INTERPRETER'
        case 'computer_use_preview': return 'COMPUTER_USE'
        default: return 'FUNCTION'
      }
    })()

    const responseTool = await prisma.responseTool.create({
      data: {
        type: toolType as any,
        responseId,
      },
    })

    if (tool.type === 'function') {
      await prisma.responseFunctionTool.create({
        data: {
          name: tool.name,
          description: tool.description ?? null,
          parameters: tool.parameters ?? {},
          strict: tool.strict ?? false,
          toolId: responseTool.id,
        },
      })
    }
  }
}

const buildVirtualRun = ({
  responseId,
  model,
  instructions,
  tools,
  threadId,
}: {
  responseId: string
  model: string
  instructions: string | null
  tools: any[]
  threadId: string
}) => ({
  id: responseId,
  object: 'thread.run' as 'thread.run',
  created_at: dayjs().unix(),
  thread_id: threadId,
  assistant_id: responseId,
  status: 'queued' as const,
  required_action: null,
  last_error: null,
  expires_at: dayjs().add(1, 'hour').unix(),
  started_at: null,
  cancelled_at: null,
  failed_at: null,
  completed_at: null,
  model,
  instructions: instructions ?? '',
  tools: tools.map((t: any) => {
    if (t.type === 'function') {
      return {
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description ?? '',
          parameters: t.parameters ?? {},
          strict: t.strict ?? false,
        },
      }
    }
    return t
  }),
  metadata: {},
  usage: null,
  truncation_strategy: { type: 'auto' as const, last_messages: null },
  response_format: 'auto' as 'auto',
  incomplete_details: null,
  max_completion_tokens: null,
  max_prompt_tokens: null,
  temperature: null,
  top_p: null,
  tool_choice: 'auto' as 'auto',
  parallel_tool_calls: true,
})

export const post = ({
  prisma,
  runAdapter,
}: {
  prisma: PrismaClient
  runAdapter: RunAdapterPartobClient
}) => async (urlString: string, options: RequestInit & { body?: string }): Promise<Response> => {
  if (!options.body) {
    throw new Error('No body provided')
  }

  const body = JSON.parse(options.body)
  const {
    model,
    input,
    instructions,
    tools = [],
    stream = false,
    conversation,
    metadata,
    temperature,
    top_p,
    max_output_tokens,
    truncation,
    text,
  } = body

  // Resolve or create conversation
  let conversationId: string | null = null
  if (conversation) {
    if (typeof conversation === 'string') {
      conversationId = conversation
    } else if (conversation.id) {
      conversationId = conversation.id
    }
  }

  if (conversation !== undefined && !conversationId) {
    const conv = await prisma.conversation.create({
      data: { metadata: metadata ?? undefined },
    })
    conversationId = conv.id
  }

  // Parse truncation
  const truncationType = (() => {
    if (!truncation) return 'DISABLED'
    if (truncation.type === 'auto') return 'AUTO'
    if (truncation.type === 'last_messages') return 'LAST_MESSAGES'
    return 'DISABLED'
  })()

  const truncationLastMessagesCount = truncation?.last_messages ?? null

  // Parse text format
  const textFormatType = text?.format?.type ?? 'text'
  const textFormatSchema = text?.format?.schema ?? null

  // Create Response record
  const response = await prisma.response.create({
    data: {
      model,
      status: 'QUEUED',
      instructions: instructions ?? null,
      metadata: metadata ?? undefined,
      temperature: temperature ?? null,
      topP: top_p ?? null,
      maxOutputTokens: max_output_tokens ?? null,
      truncationType: truncationType as any,
      truncationLastMessagesCount,
      textFormatType,
      textFormatSchema: textFormatSchema ?? undefined,
      input: input as Prisma.InputJsonValue,
      ...(conversationId
        ? { conversation: { connect: { id: conversationId } } }
        : {}),
    },
    include: {
      outputItems: true,
      tools: {
        include: {
          functionTool: true,
          fileSearchTool: true,
          webSearchTool: true,
          codeInterpreterTool: true,
          computerUseTool: true,
        },
      },
    },
  })

  // Create tools
  if (tools.length > 0) {
    await createTools({ prisma, responseId: response.id, tools })
  }

  // Build virtual thread ID for the run adapter
  const threadId = conversationId ?? response.id

  // Build virtual run for completionsRunAdapter
  const virtualRun = buildVirtualRun({
    responseId: response.id,
    model,
    instructions,
    tools,
    threadId,
  })

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        await runAdapter.handleRun({
          run: virtualRun,
          onEvent: onEvent({
            prisma,
            controller: {
              ...controller,
              enqueue: (data: any) => {
                try {
                  controller.enqueue(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`)
                } catch {}
              },
            },
            responseId: response.id,
          }),
          getMessages: getMessages({
            prisma,
            conversationId,
            input,
            truncationLastMessagesCount,
          }),
        })
      } catch (error: any) {
        console.error(error)

        await onEvent({
          prisma,
          controller: {
            ...controller,
            enqueue: (data: any) => {
              try {
                controller.enqueue(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`)
              } catch {}
            },
          },
          responseId: response.id,
        })({
          event: 'thread.run.failed',
          data: {
            id: response.id,
            failed_at: dayjs().unix(),
            last_error: {
              code: 'server_error',
              message: `${error?.message ?? ''} ${error?.cause?.message ?? ''}`,
            },
          },
        } as any)
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
  }

  // Non-streaming: consume stream, then return the final response
  const reader = readableStream.getReader()
  while (true) {
    const { done } = await reader.read()
    if (done) break
  }

  const finalResponse = await prisma.response.findUnique({
    where: { id: response.id },
    include: {
      outputItems: { orderBy: { createdAt: 'asc' } },
      tools: {
        include: {
          functionTool: true,
          fileSearchTool: true,
          webSearchTool: true,
          codeInterpreterTool: true,
          computerUseTool: true,
        },
      },
    },
  })

  return new Response(JSON.stringify(
    serializeResponse({ response: finalResponse! })
  ), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
