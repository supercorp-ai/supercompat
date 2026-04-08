import type OpenAI from 'openai'
import type { MemoryStore } from '../store'
import type { RunAdapterPartobClient, MessageWithRun } from '@/types'
import { runsRegexp } from '@/lib/runs/runsRegexp'
import { runRegexp } from '@/lib/runs/runRegexp'
import { cancelRunRegexp } from '@/lib/runs/cancelRunRegexp'
import { createThreadAndRunRegexp } from '@/lib/runs/createThreadAndRunRegexp'
import { submitToolOutputsRegexp } from '@/lib/runs/submitToolOutputsRegexp'
import { enqueueSSE } from '@/lib/sse/enqueueSSE'
import { assign } from 'radash'
import dayjs from 'dayjs'

// ── Serializers ──────────────────────────────────────────────────

const serializeRun = (run: any) => ({
  id: run.id,
  object: 'thread.run' as 'thread.run',
  created_at: dayjs(run.createdAt).unix(),
  thread_id: run.threadId,
  assistant_id: run.assistantId,
  status: run.status.toLowerCase() as any,
  required_action: run.requiredAction ?? null,
  last_error: run.lastError ?? null,
  expires_at: run.expiresAt ?? null,
  started_at: run.startedAt ?? null,
  cancelled_at: run.cancelledAt ?? null,
  failed_at: run.failedAt ?? null,
  completed_at: run.completedAt ?? null,
  model: run.model,
  instructions: run.instructions,
  tools: run.tools ?? [],
  metadata: run.metadata ?? {},
  usage: run.usage ?? null,
  truncation_strategy: { type: 'auto', last_messages: null },
  response_format: 'auto',
  incomplete_details: null,
  max_completion_tokens: null,
  max_prompt_tokens: null,
  temperature: null,
  top_p: null,
  tool_choice: run.tool_choice ?? 'auto',
  parallel_tool_calls: true,
})

const serializeRunStep = (s: any) => ({
  id: s.id,
  object: 'thread.run.step' as 'thread.run.step',
  created_at: dayjs(s.createdAt).unix(),
  assistant_id: s.assistantId,
  thread_id: s.threadId,
  run_id: s.runId,
  type: s.type.toLowerCase() as any,
  status: s.status.toLowerCase() as any,
  step_details: s.stepDetails,
  last_error: s.lastError ?? null,
  expires_at: s.expiredAt ?? null,
  cancelled_at: s.cancelledAt ?? null,
  failed_at: s.failedAt ?? null,
  completed_at: s.completedAt ?? null,
  metadata: s.metadata ?? null,
  usage: s.usage ?? null,
})

const serializeMessage = (m: any) => ({
  id: m.id,
  object: 'thread.message' as 'thread.message',
  created_at: dayjs(m.createdAt).unix(),
  thread_id: m.threadId,
  completed_at: m.completedAt ? dayjs(m.completedAt).unix() : null,
  incomplete_at: m.incompleteAt ? dayjs(m.incompleteAt).unix() : null,
  incomplete_details: m.incompleteDetails ?? null,
  role: (m.role || 'user').toLowerCase() as 'user' | 'assistant',
  content: m.content,
  assistant_id: m.assistantId ?? null,
  run_id: m.runId ?? null,
  attachments: m.attachments ?? [],
  status: (m.status || 'completed').toLowerCase(),
  metadata: assign(m.metadata as Record<any, any> ?? {}, m.toolCalls ? { toolCalls: m.toolCalls } : {}),
})

// ── onEvent handler ──────────────────────────────────────────────

const createOnEvent = ({
  store,
  controller,
}: {
  store: MemoryStore
  controller: any
}) => (event: OpenAI.Beta.AssistantStreamEvent) => {
  switch (event.event) {
    case 'thread.run.created':
      controller.enqueue(event)
      return

    case 'thread.run.in_progress':
      store.runs.update({ id: event.data.id }, { status: 'IN_PROGRESS' })
      controller.enqueue(event)
      return

    case 'thread.run.failed':
      store.runs.update({ id: event.data.id }, {
        status: 'FAILED',
        failedAt: (event.data as any).failed_at ?? dayjs().unix(),
        lastError: (event.data as any).last_error ?? null,
      })
      controller.enqueue(event)
      return

    case 'thread.run.completed':
      store.runs.update({ id: event.data.id }, {
        status: 'COMPLETED',
        requiredAction: null,
        completedAt: (event.data as any).completed_at ?? dayjs().unix(),
        usage: event.data.usage ?? null,
      })
      controller.enqueue(event)
      return

    case 'thread.run.requires_action':
      store.runs.update({ id: event.data.id }, {
        status: 'REQUIRES_ACTION',
        requiredAction: event.data.required_action,
      })
      controller.enqueue(event)
      return

    case 'thread.run.step.created': {
      const step = store.runSteps.create({
        runId: event.data.run_id,
        assistantId: event.data.assistant_id,
        threadId: event.data.thread_id,
        type: event.data.type === 'message_creation' ? 'MESSAGE_CREATION' : 'TOOL_CALLS',
        status: event.data.status === 'in_progress' ? 'IN_PROGRESS' : event.data.status.toUpperCase(),
        stepDetails: event.data.step_details,
        completedAt: event.data.completed_at,
      })
      const serialized = serializeRunStep(step)
      controller.enqueue({ ...event, data: serialized })
      return serialized
    }

    case 'thread.run.step.delta':
      controller.enqueue(event)
      return

    case 'thread.run.step.completed': {
      const updated = store.runSteps.update({ id: event.data.id }, {
        status: 'COMPLETED',
        stepDetails: event.data.step_details,
        completedAt: (event.data as any).completed_at ?? dayjs().unix(),
      })
      controller.enqueue({ ...event, data: serializeRunStep(updated) })
      return serializeRunStep(updated)
    }

    case 'thread.message.created': {
      const msg = store.messages.create({
        threadId: event.data.thread_id,
        content: event.data.content ?? [],
        role: event.data.role.toUpperCase(),
        status: 'IN_PROGRESS',
        assistantId: event.data.assistant_id ?? null,
        runId: event.data.run_id ?? null,
        metadata: null,
        attachments: [],
      })
      const serialized = serializeMessage(msg)
      controller.enqueue({ ...event, data: serialized })
      return serialized
    }

    case 'thread.message.delta':
      controller.enqueue(event)
      return

    case 'thread.message.completed': {
      // Find latest TOOL_CALLS step to capture tool_calls for message metadata
      const toolStep = store.runSteps.findFirst({
        where: { threadId: event.data.thread_id, type: 'TOOL_CALLS' },
        orderBy: { createdAt: 'desc' },
      })
      if (toolStep) {
        store.runSteps.update({ id: toolStep.id }, {
          stepDetails: {
            type: 'tool_calls',
            tool_calls: (event.data as any).tool_calls ?? (toolStep.stepDetails as any)?.tool_calls ?? [],
          },
        })
      }

      const updated = store.messages.update({ id: event.data.id }, {
        status: 'COMPLETED',
        content: event.data.content,
        toolCalls: (event.data as any).tool_calls ?? null,
      })
      controller.enqueue({ ...event, data: serializeMessage(updated) })
      return serializeMessage(updated)
    }
  }
}

// ── getMessages helper ───────────────────────────────────────────

const createGetMessages = ({
  store,
  run,
}: {
  store: MemoryStore
  run: any
}) => async (): Promise<MessageWithRun[]> => {
  const msgs = store.messages.findMany({
    where: { threadId: run.threadId },
    orderBy: { createdAt: 'asc' },
  })

  return msgs.map((m: any) => {
    const msgRun = m.runId ? store.runs.findUnique({ id: m.runId }) : null
    const runSteps = msgRun
      ? store.runSteps.findMany({ where: { runId: msgRun.id }, orderBy: { createdAt: 'asc' } })
      : []

    return {
      ...serializeMessage(m),
      run: msgRun
        ? {
          ...serializeRun(msgRun),
          runSteps: runSteps.map(serializeRunStep),
        }
        : null,
    }
  }) as MessageWithRun[]
}

// ── Run stream helper ────────────────────────────────────────────

const createRunStream = async ({
  store,
  runAdapter,
  run,
  stream,
}: {
  store: MemoryStore
  runAdapter: RunAdapterPartobClient
  run: any
  stream: boolean
}) => {
  const serializedRun = serializeRun(run)

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        await runAdapter.handleRun({
          run: serializedRun,
          onEvent: createOnEvent({
            store,
            controller: {
              ...controller,
              enqueue: (data: any) => {
                enqueueSSE(controller, data.event, data.data)
              },
            },
          }),
          getMessages: createGetMessages({ store, run }),
        })
      } catch (error: any) {
        console.error(error)
        createOnEvent({
          store,
          controller: {
            ...controller,
            enqueue: (data: any) => {
              enqueueSSE(controller, data.event, data.data)
            },
          },
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
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  // Non-streaming: consume the stream fully so events update the store, then return
  const reader = readableStream.getReader()
  while (true) { const { done } = await reader.read(); if (done) break }

  // Return the updated run from the store (status may have changed)
  const updatedRun = store.runs.findUnique({ id: run.id })
  return new Response(JSON.stringify(updatedRun ? serializeRun(updatedRun) : serializedRun), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ── Handlers ─────────────────────────────────────────────────────

export const runs = ({ store, runAdapter }: { store: MemoryStore; runAdapter: RunAdapterPartobClient }) => ({
  get: async (urlString: string) => {
    const url = new URL(urlString)
    const threadId = url.pathname.match(/threads\/([^/]+)/)?.[1]!
    const limit = parseInt(url.searchParams.get('limit') ?? '20')
    const order = (url.searchParams.get('order') ?? 'desc') as 'asc' | 'desc'
    const after = url.searchParams.get('after')
    const pageSize = Math.min(limit, 100)

    let items = store.runs.findMany({
      where: { threadId },
      orderBy: { createdAt: order },
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      take: pageSize + 1,
    })

    const hasMore = items.length > pageSize
    if (hasMore) items = items.slice(0, pageSize)
    const data = items.map(serializeRun)

    return new Response(JSON.stringify({
      object: 'list',
      data,
      first_id: data[0]?.id ?? null,
      last_id: data[data.length - 1]?.id ?? null,
      has_more: hasMore,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  },
  post: async (urlString: string, options: any) => {
    const url = new URL(urlString)
    const threadId = url.pathname.match(/threads\/([^/]+)/)?.[1]!
    const body = JSON.parse(options.body)
    const { assistant_id, stream: isStream } = body

    const assistantRecord = store.assistants.findUnique({ id: assistant_id })
    if (!assistantRecord) throw new Error('Assistant not found')

    const { model, instructions, tools, metadata, response_format, truncation_strategy } = {
      model: assistantRecord.modelSlug,
      instructions: '',
      truncation_strategy: { type: 'auto' },
      response_format: { type: 'text' },
      ...body,
    }

    const run = store.runs.create({
      status: 'QUEUED',
      expiresAt: dayjs().add(1, 'hour').unix(),
      model,
      instructions,
      tools: tools ?? [],
      metadata: metadata ?? null,
      threadId,
      assistantId: assistant_id,
      truncationStrategy: truncation_strategy,
      responseFormat: response_format,
      tool_choice: body.tool_choice ?? 'auto',
    })

    return createRunStream({ store, runAdapter, run, stream: !!isStream })
  },
})

export const run = ({ store, runAdapter }: { store: MemoryStore; runAdapter: RunAdapterPartobClient }) => ({
  get: async (urlString: string) => {
    const pathname = new URL(urlString).pathname
    const threadId = pathname.match(/threads\/([^/]+)/)?.[1]!
    const runId = pathname.match(/runs\/([^/]+)/)?.[1]!
    const record = store.runs.findUnique({ id: runId, threadId })
    if (!record) return new Response('Not found', { status: 404 })
    return new Response(JSON.stringify(serializeRun(record)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  },
  post: async (urlString: string, options: any) => {
    const pathname = new URL(urlString).pathname
    const threadId = pathname.match(/threads\/([^/]+)/)?.[1]!
    const runId = pathname.match(/runs\/([^/]+)/)?.[1]!
    const body = JSON.parse(options.body)
    const record = store.runs.update({ id: runId, threadId }, {
      ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
    })
    return new Response(JSON.stringify(serializeRun(record)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  },
})

export const cancelRun = ({ store }: { store: MemoryStore }) => ({
  post: async (urlString: string) => {
    const pathname = new URL(urlString).pathname
    const threadId = pathname.match(/threads\/([^/]+)/)?.[1]!
    const runId = pathname.match(/runs\/([^/]+)/)?.[1]!
    const record = store.runs.update({ id: runId, threadId }, {
      status: 'CANCELLED',
      cancelledAt: dayjs().unix(),
    })
    return new Response(JSON.stringify(serializeRun(record)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  },
})

export const createAndRun = ({ store, runAdapter }: { store: MemoryStore; runAdapter: RunAdapterPartobClient }) => ({
  post: async (_urlString: string, options: any) => {
    const body = JSON.parse(options.body)
    const { assistant_id, thread: threadBody, stream: isStream } = body

    const assistantRecord = store.assistants.findUnique({ id: assistant_id })
    if (!assistantRecord) throw new Error('Assistant not found')

    const threadData = threadBody ?? {}
    const threadRecord = store.threads.create({
      assistantId: assistant_id,
      metadata: { ...(threadData.metadata ?? {}), assistantId: assistant_id },
    })

    if (threadData.messages?.length) {
      for (const msg of threadData.messages) {
        const content = typeof msg.content === 'string'
          ? [{ type: 'text', text: { value: msg.content, annotations: [] } }]
          : msg.content
        store.messages.create({
          threadId: threadRecord.id,
          role: (msg.role || 'user').toUpperCase(),
          content,
          status: 'COMPLETED',
          metadata: msg.metadata ?? null,
          attachments: [],
        })
      }
    }

    const { model, instructions, tools, metadata } = {
      model: assistantRecord.modelSlug,
      instructions: '',
      ...body,
    }

    const run = store.runs.create({
      status: 'QUEUED',
      expiresAt: dayjs().add(1, 'hour').unix(),
      model,
      instructions,
      tools: tools ?? [],
      metadata: metadata ?? null,
      threadId: threadRecord.id,
      assistantId: assistant_id,
      truncationStrategy: { type: 'auto' },
      responseFormat: { type: 'text' },
      tool_choice: body.tool_choice ?? 'auto',
    })

    return createRunStream({ store, runAdapter, run, stream: !!isStream })
  },
})

export const submitToolOutputs = ({ store, runAdapter }: { store: MemoryStore; runAdapter: RunAdapterPartobClient }) => ({
  post: async (urlString: string, options: any) => {
    const url = new URL(urlString)
    const [, threadId, runId] = url.pathname.match(new RegExp(submitToolOutputsRegexp))!
    const body = JSON.parse(options.body)
    const { tool_outputs, stream: isStream } = body

    // Update in-progress tool call steps with outputs
    const runSteps = store.runSteps.findMany({
      where: { threadId, runId, type: 'TOOL_CALLS', status: 'IN_PROGRESS' },
      orderBy: { createdAt: 'asc' },
    })

    for (const runStep of runSteps) {
      store.runSteps.update({ id: runStep.id }, {
        status: 'COMPLETED',
        completedAt: dayjs().unix(),
        stepDetails: {
          type: 'tool_calls',
          tool_calls: ((runStep.stepDetails as any)?.tool_calls ?? []).map((tc: any) => {
            const output = tool_outputs.find((o: any) => o.tool_call_id === tc.id) || tool_outputs[0]
            return {
              id: tc.id,
              type: tc.type,
              function: { ...tc.function, output: output?.output },
            }
          }),
        },
      })

      if (isStream) {
        // Step completed events are emitted by the stream
      }
    }

    // Re-queue the run
    const run = store.runs.update({ id: runId }, { status: 'QUEUED' })

    return createRunStream({ store, runAdapter, run, stream: !!isStream })
  },
})
