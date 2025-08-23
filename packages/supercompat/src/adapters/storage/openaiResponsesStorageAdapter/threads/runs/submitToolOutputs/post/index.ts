import OpenAI from 'openai'
import { submitToolOutputsRegexp } from '@/lib/runs/submitToolOutputsRegexp'
import {
  RunAdapterPartobClient,
  ThreadWithConversationId,
  MessageWithRun,
} from '@/types'
import dayjs from 'dayjs'

export const post = ({
  openai,
  runAdapter,
}: {
  openai: OpenAI
  runAdapter: RunAdapterPartobClient
}) => async (urlString: string, options: any): Promise<Response> => {
  const url = new URL(urlString)
  const [, threadId, runId] = url.pathname.match(
    new RegExp(submitToolOutputsRegexp),
  )!
  const body = JSON.parse(options.body)
  const { tool_outputs, stream } = body

  const conversation = await openai.conversations
    .retrieve(threadId)
    .catch(() => null)
  if (!conversation) return new Response('Not found', { status: 404 })

  const thread: ThreadWithConversationId = {
    id: threadId,
    object: 'thread',
    created_at: conversation.created_at ?? dayjs().unix(),
    metadata: (conversation.metadata ?? {}) as Record<string, string>,
    tool_resources: null,
    openaiConversationId: threadId,
  }

  const runJson = (thread.metadata as Record<string, string>)[`run_${runId}`]
  const run: OpenAI.Beta.Threads.Run | null = runJson
    ? (JSON.parse(runJson) as any)
    : null
  if (!run) return new Response('Not found', { status: 404 })

  for (const t of tool_outputs) {
    await openai.conversations.items.create(thread.openaiConversationId as string, {
      items: [
        {
          type: 'function_call_output',
          call_id: t.tool_call_id,
          output: t.output,
        },
      ],
    })
  }

  const onEvent = async (event: OpenAI.Beta.AssistantStreamEvent) => {
    if (event.event === 'thread.run.completed') {
      run.status = 'completed'
    } else if (event.event === 'thread.run.failed') {
      run.status = 'failed'
      ;(run as any).last_error = event.data.last_error
    }
    const conv = (event.data as any)?.metadata?.openaiConversationId
    if (conv && conv !== thread.openaiConversationId) {
      thread.openaiConversationId = conv
    }
    await openai.conversations.update(thread.openaiConversationId as string, {
      metadata: {
        ...thread.metadata,
        [`run_${run.id}`]: JSON.stringify(run),
      },
    })
    thread.metadata = {
      ...thread.metadata,
      [`run_${run.id}`]: JSON.stringify(run),
    }
    return event.data
  }

  const getThread = async () => thread
  const getMessages = async (): Promise<MessageWithRun[]> => {
    const items = await openai.conversations.items.list(
      thread.openaiConversationId as string,
    )
    return (items.data || [])
      .filter((i: any) => i.type === 'message')
      .map((item: any) => ({
        id: item.id,
        object: 'thread.message',
        created_at: item.created_at ?? dayjs().unix(),
        thread_id: threadId,
        role: item.role,
        content: (item.content || []).map((c: any) => ({
          type: 'text',
          text: { value: c.text, annotations: [] },
        })),
        metadata: null,
        assistant_id: null,
        run_id: null,
        attachments: [],
        status: 'completed',
        completed_at: item.completed_at ?? dayjs().unix(),
        incomplete_at: null,
        incomplete_details: null,
        run: null,
      })) as MessageWithRun[]
  }

  const finalize = async () => {
    if (run.status !== 'requires_action') {
      const { [`run_${run.id}`]: _ignored, ...rest } =
        thread.metadata as Record<string, string>
      await openai.conversations.update(thread.openaiConversationId as string, {
        metadata: rest,
      })
      thread.metadata = rest
    }
  }

  if (stream) {
    const readableStream = new ReadableStream({
      async start(controller) {
        await runAdapter({
          run,
          onEvent: (event) => {
            controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
            return onEvent(event)
          },
          getMessages,
          getThread,
        })
        await finalize()
        controller.close()
      },
    })
    return new Response(readableStream, {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  await runAdapter({ run, onEvent, getMessages, getThread })
  await finalize()

  return new Response(JSON.stringify(run), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
