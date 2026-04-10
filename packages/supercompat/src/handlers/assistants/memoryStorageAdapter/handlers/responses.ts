import type OpenAI from 'openai'
import type { MemoryStore } from '../store'
import type { RunAdapterPartobClient, RequestHandler, MessageWithRun } from '@/types'
import { serializeResponse } from '@/handlers/responses/serializers/serializeResponse'
import { serializeOutputItem } from '@/handlers/responses/serializers/serializeOutputItem'
import { getMessages as createGetMessagesFactory } from '@/handlers/responses/prisma/getMessages'
import { enqueueSSE } from '@/lib/sse/enqueueSSE'
import dayjs from 'dayjs'

type MethodHandlers = { get?: RequestHandler; post?: RequestHandler; delete?: RequestHandler }

// ── Helper: build a response with relations from store ───────────

const getResponseWithRelations = (store: MemoryStore, id: string) => {
  const response = store.responses.findUnique({ id })
  if (!response) return null
  const outputItems = store.responseOutputItems.findMany({
    where: { responseId: id },
    orderBy: { createdAt: 'asc' },
  })
  const tools = store.responseTools.findMany({ where: { responseId: id } }).map((t: any) => ({
    ...t,
    functionTool: store.responseFunctionTools.findFirst({ where: { toolId: t.id } }),
    fileSearchTool: store.responseFileSearchTools.findFirst({ where: { toolId: t.id } }),
    webSearchTool: store.responseWebSearchTools.findFirst({ where: { toolId: t.id } }),
    codeInterpreterTool: store.responseCodeInterpreterTools.findFirst({ where: { toolId: t.id } }),
    computerUseTool: store.responseComputerUseTools.findFirst({ where: { toolId: t.id } }),
  }))
  return { ...response, outputItems, tools }
}

// ── Helper: create tools in store ────────────────────────────────

const createTools = (store: MemoryStore, responseId: string, tools: any[]) => {
  for (const tool of tools) {
    const toolType = (() => {
      switch (tool.type) {
        case 'function': return 'FUNCTION'
        case 'file_search': return 'FILE_SEARCH'
        case 'web_search_preview': return 'WEB_SEARCH'
        case 'code_interpreter': return 'CODE_INTERPRETER'
        case 'computer': case 'computer_use_preview': return 'COMPUTER_USE'
        default: return 'FUNCTION'
      }
    })()

    const responseTool = store.responseTools.create({ type: toolType, responseId })

    if (tool.type === 'function') {
      store.responseFunctionTools.create({
        name: tool.name,
        description: tool.description ?? null,
        parameters: tool.parameters ?? {},
        strict: tool.strict ?? false,
        toolId: responseTool.id,
      })
    }
  }
}

// ── Responses onEvent (translates Assistants events → Responses events) ──

const createResponsesOnEvent = ({
  store,
  controller,
  responseId,
}: {
  store: MemoryStore
  controller: ReadableStreamDefaultController
  responseId: string
}) => {
  let currentOutputItemId: string | null = null
  let outputIndex = 0
  const toolCallInfos = new Map<number, { callId: string; name: string; argumentChunks: string[] }>()
  const functionCallItems = new Map<number, string>()

  const enqueueEvent = (data: any) => {
    try { controller.enqueue(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`) } catch {}
  }

  return async (event: OpenAI.Beta.AssistantStreamEvent) => {
    switch (event.event) {
      case 'thread.run.in_progress': {
        store.responses.update({ id: responseId }, { status: 'IN_PROGRESS' })
        const response = getResponseWithRelations(store, responseId)
        const serialized = serializeResponse({ response: response! })
        enqueueEvent({ type: 'response.created', response: serialized })
        enqueueEvent({ type: 'response.in_progress', response: serialized })
        return
      }

      case 'thread.message.created': {
        const outputItem = store.responseOutputItems.create({
          responseId,
          type: 'MESSAGE',
          status: 'IN_PROGRESS',
          role: 'assistant',
          content: [],
        })
        currentOutputItemId = outputItem.id
        enqueueEvent({
          type: 'response.output_item.added',
          output_index: outputIndex,
          item: serializeOutputItem({ outputItem }),
        })
        enqueueEvent({
          type: 'response.content_part.added',
          item_id: outputItem.id,
          output_index: outputIndex,
          content_index: 0,
          part: { type: 'output_text', text: '', annotations: [] },
        })
        return outputItem
      }

      case 'thread.message.delta': {
        if (!currentOutputItemId) return
        const delta = (event.data as any)?.delta
        const textDelta = delta?.content?.[0]
        if (textDelta?.type === 'text') {
          enqueueEvent({
            type: 'response.output_text.delta',
            item_id: currentOutputItemId,
            output_index: outputIndex,
            content_index: 0,
            delta: textDelta.text.value,
          })
        }
        return
      }

      case 'thread.message.completed': {
        if (!currentOutputItemId) return
        const content = event.data.content
        const text = (content as any[])
          ?.filter((c: any) => c.type === 'text')
          .map((c: any) => c.text.value)
          .join('') ?? ''

        const outputContent = [{ type: 'output_text', text, annotations: [] }]
        const updated = store.responseOutputItems.update({ id: currentOutputItemId }, {
          status: 'COMPLETED',
          content: outputContent,
        })

        enqueueEvent({
          type: 'response.output_text.done',
          item_id: currentOutputItemId,
          output_index: outputIndex,
          content_index: 0,
          text,
        })
        enqueueEvent({
          type: 'response.content_part.done',
          item_id: currentOutputItemId,
          output_index: outputIndex,
          content_index: 0,
          part: { type: 'output_text', text, annotations: [] },
        })
        enqueueEvent({
          type: 'response.output_item.done',
          output_index: outputIndex,
          item: serializeOutputItem({ outputItem: updated }),
        })
        outputIndex++
        // completionsRunAdapter reads .toolCalls to decide requires_action
        return { ...event.data, toolCalls: (event.data as any).tool_calls ?? null }
      }

      case 'thread.run.step.created':
        // completionsRunAdapter reads .id from the returned step
        return { id: event.data.id ?? `step_${Date.now()}` }

      case 'thread.run.step.delta': {
        const toolCalls = ((event as any).data.delta as any)?.step_details?.tool_calls
        if (!toolCalls) return
        for (const tc of toolCalls) {
          const index = tc.index ?? 0
          if (!toolCallInfos.has(index)) {
            toolCallInfos.set(index, { callId: tc.id ?? '', name: tc.function?.name ?? '', argumentChunks: [] })
          }
          const info = toolCallInfos.get(index)!
          if (tc.id) info.callId = tc.id
          if (tc.function?.name) info.name = tc.function.name
          const argsDelta = tc.function?.arguments ?? ''
          if (argsDelta) {
            info.argumentChunks.push(argsDelta)
            enqueueEvent({
              type: 'response.function_call_arguments.delta',
              item_id: `pending_${index}`,
              output_index: outputIndex + index,
              delta: argsDelta,
            })
          }
        }
        return
      }

      case 'thread.run.step.completed':
        return

      case 'thread.run.completed': {
        store.responses.update({ id: responseId }, {
          status: 'COMPLETED',
          usage: event.data.usage ?? null,
        })
        const response = getResponseWithRelations(store, responseId)
        enqueueEvent({ type: 'response.completed', response: serializeResponse({ response: response! }) })
        return
      }

      case 'thread.run.requires_action': {
        const toolCalls = event.data.required_action?.submit_tool_outputs?.tool_calls ?? []
        for (let i = 0; i < toolCalls.length; i++) {
          const tc = toolCalls[i]
          const info = toolCallInfos.get(i)
          const callId = info?.callId || tc.id
          const name = info?.name || tc.function?.name || ''
          const args = info ? info.argumentChunks.join('') : tc.function?.arguments || ''

          const outputItem = store.responseOutputItems.create({
            responseId,
            type: 'FUNCTION_CALL',
            status: 'COMPLETED',
            callId,
            name,
            arguments: args,
          })
          functionCallItems.set(i, outputItem.id)

          enqueueEvent({
            type: 'response.output_item.added',
            output_index: outputIndex + i,
            item: serializeOutputItem({ outputItem }),
          })
          enqueueEvent({
            type: 'response.function_call_arguments.done',
            item_id: outputItem.id,
            output_index: outputIndex + i,
            arguments: args,
          })
          enqueueEvent({
            type: 'response.output_item.done',
            output_index: outputIndex + i,
            item: serializeOutputItem({ outputItem }),
          })
        }
        outputIndex += toolCalls.length

        store.responses.update({ id: responseId }, { status: 'COMPLETED' })
        const response = getResponseWithRelations(store, responseId)
        enqueueEvent({ type: 'response.completed', response: serializeResponse({ response: response! }) })
        return
      }

      case 'thread.run.failed': {
        store.responses.update({ id: responseId }, {
          status: 'FAILED',
          error: (event.data as any).last_error ?? null,
        })
        const response = getResponseWithRelations(store, responseId)
        enqueueEvent({ type: 'response.failed', response: serializeResponse({ response: response! }) })
        return
      }
    }
  }
}

// ── Create a fake PrismaClient for getMessages (reuses existing code) ──

const createFakePrisma = (store: MemoryStore) => ({
  response: {
    findMany: (opts: any) => {
      const items = store.responses.findMany({
        where: opts.where,
        orderBy: opts.orderBy,
      }).map((r: any) => ({
        ...r,
        outputItems: store.responseOutputItems.findMany({
          where: { responseId: r.id },
          orderBy: { createdAt: 'asc' },
        }),
      }))
      // Handle status.in filter
      if (opts.where?.status?.in) {
        return items.filter((r: any) => opts.where.status.in.includes(r.status))
      }
      return items
    },
  },
})

// ── Exported handlers ────────────────────────────────────────────

export const responsesHandlers = ({
  store,
  runAdapter,
}: {
  store: MemoryStore
  runAdapter: RunAdapterPartobClient
}): Record<string, MethodHandlers> => ({
  // Conversations
  '^/(?:v1/|openai/)?conversations/[^/]+/items/[^/]+$': {
    get: async (urlString: string) => {
      const itemId = new URL(urlString).pathname.split('/').pop()!
      const item = store.responseOutputItems.findUniqueOrThrow({ id: itemId })
      return new Response(JSON.stringify({
        id: item.id,
        type: item.type === 'MESSAGE' ? 'message' : 'function_call',
        role: item.role || 'assistant',
        content: item.content,
        status: item.status?.toLowerCase() || 'completed',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
    delete: async (urlString: string) => {
      const parts = new URL(urlString).pathname.split('/')
      const itemId = parts.pop()!
      parts.pop() // 'items'
      const conversationId = parts.pop()!
      store.responseOutputItems.delete({ id: itemId })
      const conv = store.conversations.findUniqueOrThrow({ id: conversationId })
      return new Response(JSON.stringify({
        id: conv.id, object: 'conversation', created_at: dayjs(conv.createdAt).unix(), metadata: conv.metadata || {},
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
  },
  '^/(?:v1/|openai/)?conversations/[^/]+/items$': {
    get: async (urlString: string) => {
      const parts = new URL(urlString).pathname.split('/')
      const conversationId = parts[parts.length - 2]
      const responses = store.responses.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
      })
      const items: any[] = []
      for (const response of responses) {
        const input = response.input as any
        if (Array.isArray(input)) {
          for (const item of input) {
            if (item.type === 'message') {
              items.push({
                id: `item_${items.length}`, type: 'message', role: item.role || 'user',
                content: Array.isArray(item.content) ? item.content : [{ type: 'input_text', text: typeof item.content === 'string' ? item.content : '' }],
              })
            }
          }
        } else if (typeof input === 'string') {
          items.push({ id: `item_${items.length}`, type: 'message', role: 'user', content: [{ type: 'input_text', text: input }] })
        }
        const outputItems = store.responseOutputItems.findMany({ where: { responseId: response.id }, orderBy: { createdAt: 'asc' } })
        for (const oi of outputItems) {
          if (oi.type === 'MESSAGE') {
            items.push({ id: oi.id, type: 'message', role: 'assistant', content: oi.content || [], status: oi.status?.toLowerCase() || 'completed' })
          } else if (oi.type === 'FUNCTION_CALL') {
            items.push({ id: oi.id, type: 'function_call', call_id: oi.callId, name: oi.name, arguments: oi.arguments, status: oi.status?.toLowerCase() || 'completed' })
          }
        }
      }
      return new Response(JSON.stringify({
        data: items, has_more: false, first_id: items[0]?.id ?? null, last_id: items[items.length - 1]?.id ?? null,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
    post: async (urlString: string, options: any) => {
      const parts = new URL(urlString).pathname.split('/')
      const conversationId = parts[parts.length - 2]
      const body = typeof options?.body === 'string' ? JSON.parse(options.body) : (options?.body || {})
      const inputItems = body.items || []
      const response = store.responses.create({ model: '', status: 'COMPLETED', conversationId, input: inputItems })
      const createdItems: any[] = []
      for (const item of inputItems) {
        if (item.type === 'message') {
          const oi = store.responseOutputItems.create({ responseId: response.id, type: 'MESSAGE', status: 'COMPLETED', role: item.role || 'user', content: item.content })
          createdItems.push({ id: oi.id, type: 'message', role: item.role || 'user', content: item.content, status: 'completed' })
        }
      }
      return new Response(JSON.stringify({
        data: createdItems, has_more: false, first_id: createdItems[0]?.id ?? null, last_id: createdItems[createdItems.length - 1]?.id ?? null,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
  },
  '^/(?:v1/|openai/)?conversations/[^/]+$': {
    get: async (urlString: string) => {
      const id = new URL(urlString).pathname.split('/').pop()!
      const conv = store.conversations.findUniqueOrThrow({ id })
      return new Response(JSON.stringify({ id: conv.id, object: 'conversation', created_at: dayjs(conv.createdAt).unix(), metadata: conv.metadata || {} }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
    post: async (urlString: string, options: any) => {
      const id = new URL(urlString).pathname.split('/').pop()!
      const body = typeof options?.body === 'string' ? JSON.parse(options.body) : (options?.body || {})
      const conv = store.conversations.update({ id }, { metadata: body.metadata ?? undefined })
      return new Response(JSON.stringify({ id: conv.id, object: 'conversation', created_at: dayjs(conv.createdAt).unix(), metadata: conv.metadata || {} }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
    delete: async (urlString: string) => {
      const id = new URL(urlString).pathname.split('/').pop()!
      store.conversations.delete({ id })
      return new Response(JSON.stringify({ id, object: 'conversation.deleted', deleted: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
  },
  '^/(?:v1/|openai/)?conversations$': {
    post: async (_urlString: string, options: any) => {
      const body = typeof options?.body === 'string' ? JSON.parse(options.body) : (options?.body || {})
      const conv = store.conversations.create({ metadata: body.metadata ?? undefined })
      return new Response(JSON.stringify({ id: conv.id, object: 'conversation', created_at: dayjs(conv.createdAt).unix(), metadata: conv.metadata || {} }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
  },
  // Responses
  '^/(?:v1/|openai/)?responses$': {
    post: async (urlString: string, options: any) => {
      const body = JSON.parse(options.body)
      const { model, input, instructions, tools = [], stream = false, conversation, previous_response_id, metadata, temperature, top_p, max_output_tokens, truncation, text } = body

      let conversationId: string | null = null
      if (previous_response_id) {
        const prev = store.responses.findUnique({ id: previous_response_id })
        if (prev?.conversationId) conversationId = prev.conversationId
        else {
          const conv = store.conversations.create({ metadata: metadata ?? undefined })
          conversationId = conv.id
          if (prev) store.responses.update({ id: previous_response_id }, { conversationId: conv.id })
        }
      }
      if (!conversationId && conversation) {
        conversationId = typeof conversation === 'string' ? conversation : conversation.id
      }
      if (!conversationId && conversation !== undefined) {
        const conv = store.conversations.create({ metadata: metadata ?? undefined })
        conversationId = conv.id
      }

      const truncationType = (() => { if (!truncation) return 'DISABLED'; if (truncation.type === 'auto') return 'AUTO'; return 'DISABLED' })()
      const truncationLastMessagesCount = truncation?.last_messages ?? null

      const response = store.responses.create({
        model, status: 'QUEUED', instructions: instructions ?? null, metadata: metadata ?? undefined,
        temperature: temperature ?? null, topP: top_p ?? null, maxOutputTokens: max_output_tokens ?? null,
        truncationType, truncationLastMessagesCount, textFormatType: text?.format?.type ?? 'text',
        textFormatSchema: text?.format?.schema ?? null, input,
        ...(conversationId ? { conversationId } : {}),
      })

      if (tools.length > 0) createTools(store, response.id, tools)

      const fakePrisma = createFakePrisma(store)

      const readableStream = new ReadableStream({
        async start(controller) {
          const onEvent = createResponsesOnEvent({ store, controller, responseId: response.id })
          const unifiedOnEvent = async (event: any) => {
            if (event.type?.startsWith('response.')) {
              try { controller.enqueue(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`) } catch {}
              return
            } else if (event.event) {
              return onEvent(event)
            }
          }

          try {
            await (runAdapter.handleRun as any)({
              body: { model, input, status: 'queued', ...(instructions ? { instructions } : {}), ...(tools.length ? { tools } : {}), ...(conversationId ? { conversation: conversationId } : {}), ...(temperature != null ? { temperature } : {}), ...(body.tool_choice ? { tool_choice: body.tool_choice } : {}), ...(text ? { text } : {}) },
              onEvent: unifiedOnEvent,
              getMessages: createGetMessagesFactory({ prisma: fakePrisma as any, conversationId, input, truncationLastMessagesCount }),
            })

            // Store output items from native adapters if needed
            const finalResponse = getResponseWithRelations(store, response.id)
            if (finalResponse && finalResponse.status === 'QUEUED') {
              store.responses.update({ id: response.id }, { status: 'COMPLETED' })
            }
          } catch (error: any) {
            console.error(error)
            store.responses.update({ id: response.id }, { status: 'FAILED', error: { code: 'server_error', message: error?.message ?? '' } })
          }
          controller.close()
        },
      })

      if (stream) {
        return new Response(readableStream, { headers: { 'Content-Type': 'text/event-stream' } })
      }

      // Non-streaming: consume stream, return final response
      const reader = readableStream.getReader()
      while (true) { const { done } = await reader.read(); if (done) break }
      const finalResponse = getResponseWithRelations(store, response.id)
      return new Response(JSON.stringify(serializeResponse({ response: finalResponse! })), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    },
  },
  '^/(?:v1/|openai/)?responses/[^/]+/cancel$': {
    post: async (urlString: string) => {
      const id = new URL(urlString).pathname.match(/responses\/([^/]+)/)?.[1]!
      store.responses.update({ id }, { status: 'CANCELLED' })
      const response = getResponseWithRelations(store, id)
      return new Response(JSON.stringify(serializeResponse({ response: response! })), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    },
  },
  '^/(?:v1/|openai/)?responses/[^/]+/input_items$': {
    get: async (urlString: string) => {
      const url = new URL(urlString)
      const responseId = url.pathname.match(/responses\/([^/]+)/)?.[1]!
      const limit = parseInt(url.searchParams.get('limit') ?? '20')
      const after = url.searchParams.get('after')
      const response = store.responses.findUnique({ id: responseId })
      if (!response) return new Response('Not found', { status: 404 })
      const input = response.input as any
      let items: any[] = []
      if (typeof input === 'string') {
        items = [{ id: 'item_0', type: 'message', role: 'user', content: [{ type: 'input_text', text: input }] }]
      } else if (Array.isArray(input)) {
        items = input.map((item: any, i: number) => ({
          id: item.id ?? `item_${i}`,
          ...item,
          ...(item.content && !Array.isArray(item.content) ? { content: [{ type: 'input_text', text: String(item.content) }] } : {}),
        }))
      }
      let startIdx = 0
      if (after) { const idx = items.findIndex((i: any) => i.id === after); if (idx >= 0) startIdx = idx + 1 }
      const page = items.slice(startIdx, startIdx + limit)
      return new Response(JSON.stringify({
        data: page, has_more: startIdx + limit < items.length,
        first_id: page[0]?.id ?? null, last_id: page[page.length - 1]?.id ?? null,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
  },
  '^/(?:v1/|openai/)?responses/[^/]+$': {
    get: async (urlString: string) => {
      const id = new URL(urlString).pathname.match(/responses\/([^/]+)/)?.[1]!
      const response = getResponseWithRelations(store, id)
      if (!response) return new Response('Not found', { status: 404 })
      return new Response(JSON.stringify(serializeResponse({ response })), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    },
    delete: async (urlString: string) => {
      const id = new URL(urlString).pathname.match(/responses\/([^/]+)/)?.[1]!
      store.responses.delete({ id })
      return new Response(JSON.stringify({ id, object: 'response.deleted', deleted: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    },
  },
})
