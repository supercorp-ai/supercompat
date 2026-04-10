import type { PrismaClient, Prisma } from '@prisma/client'
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
        case 'computer': return 'COMPUTER_USE'
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
    previous_response_id,
    metadata,
    temperature,
    top_p,
    max_output_tokens,
    truncation,
    text,
  } = body

  // Resolve or create conversation
  let conversationId: string | null = null

  // previous_response_id: chain onto the same conversation as the previous response
  if (previous_response_id) {
    const prevResponse = await prisma.response.findUnique({
      where: { id: previous_response_id },
    })
    if (prevResponse?.conversationId) {
      conversationId = prevResponse.conversationId
    } else {
      // Previous response had no conversation — create one and link both
      const conv = await prisma.conversation.create({
        data: { metadata: metadata ?? undefined },
      })
      conversationId = conv.id
      // Link previous response to this conversation
      if (prevResponse) {
        await prisma.response.update({
          where: { id: previous_response_id },
          data: { conversationId: conv.id },
        })
      }
    }
  }

  if (!conversationId && conversation) {
    if (typeof conversation === 'string') {
      conversationId = conversation
    } else if (conversation.id) {
      conversationId = conversation.id
    }
  }

  if (!conversationId && conversation !== undefined) {
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

  // Build request body from user params — passed directly to the run adapter
  const requestBody: any = {
    model,
    input,
    // status: 'queued' signals completionsRunAdapter to execute
    status: 'queued',
  }
  if (instructions) requestBody.instructions = instructions
  if (tools.length > 0) requestBody.tools = tools
  if (metadata) requestBody.metadata = metadata
  if (conversationId) requestBody.conversation = conversationId
  if (temperature != null) requestBody.temperature = temperature
  if (top_p != null) requestBody.top_p = top_p
  if (max_output_tokens != null) requestBody.max_output_tokens = max_output_tokens
  if (truncation) requestBody.truncation = truncation === 'DISABLED' ? 'disabled' : 'auto'
  if (text) requestBody.text = text
  if (body.tool_choice) requestBody.tool_choice = body.tool_choice
  if (body.parallel_tool_calls != null) requestBody.parallel_tool_calls = body.parallel_tool_calls

  const readableStream = new ReadableStream({
    async start(controller) {
      const enqueueEvent = (data: any) => {
        try {
          controller.enqueue(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`)
        } catch {}
      }

      // Assistants event translator (for completionsRunAdapter)
      const assistantsOnEvent = onEvent({
        prisma,
        controller: {
          ...controller,
          enqueue: enqueueEvent,
        },
        responseId: response.id,
      })

      // Track completed response from native adapters
      let completedResponse: any = null

      // Unified onEvent handler — accepts both Responses and Assistants events
      const unifiedOnEvent = async (event: any) => {
        if (event.type?.startsWith('response.')) {
          // Native Responses event — pass through to SSE stream
          enqueueEvent(event)

          if (event.type === 'response.completed') {
            completedResponse = event.response
          }
        } else if (event.event) {
          // Assistants event — translate to Responses events
          return assistantsOnEvent(event)
        }
      }

      try {
        await (runAdapter.handleRun as any)({
          body: requestBody,
          onEvent: unifiedOnEvent,
          getMessages: getMessages({
            prisma,
            conversationId,
            input,
            truncationLastMessagesCount,
          }),
        })

        // Store output items from native adapters
        if (completedResponse) {
          await prisma.response.update({
            where: { id: response.id },
            data: {
              status: 'COMPLETED',
              usage: (completedResponse.usage ?? undefined) as any,
            },
          })

          for (const item of completedResponse.output ?? []) {
            if (item.type === 'message') {
              await prisma.responseOutputItem.create({
                data: {
                  responseId: response.id,
                  type: 'MESSAGE',
                  status: 'COMPLETED',
                  role: item.role || 'assistant',
                  content: item.content as any,
                },
              })
            } else if (item.type === 'function_call') {
              await prisma.responseOutputItem.create({
                data: {
                  responseId: response.id,
                  type: 'FUNCTION_CALL',
                  status: 'COMPLETED',
                  callId: item.call_id,
                  name: item.name,
                  arguments: item.arguments,
                },
              })
            } else if (item.type === 'computer_call') {
              await prisma.responseOutputItem.create({
                data: {
                  responseId: response.id,
                  type: 'COMPUTER_CALL',
                  status: 'COMPLETED',
                  callId: item.call_id,
                  actions: item.actions as any,
                  pendingSafetyChecks: item.pending_safety_checks as any,
                },
              })
            }
          }
        }
      } catch (error: any) {
        console.error(error)

        enqueueEvent({
          type: 'response.failed',
          response: {
            id: response.id,
            status: 'failed',
            error: { code: 'server_error', message: error?.message ?? '' },
          },
        })
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
