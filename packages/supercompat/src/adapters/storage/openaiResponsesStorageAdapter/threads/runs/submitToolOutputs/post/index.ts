import OpenAI from 'openai'
import { submitToolOutputsRegexp } from '@/lib/runs/submitToolOutputsRegexp'
import {
  RunAdapterPartobClient,
  ThreadWithConversationId,
  MessageWithRun,
} from '@/types'
import dayjs from 'dayjs'
import { getRun, setRun } from '../../store'

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

  const run = getRun(runId)
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
        setRun(run)
        controller.close()
      },
    })
    return new Response(readableStream, {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  await runAdapter({ run, onEvent, getMessages, getThread })
  setRun(run)

  return new Response(JSON.stringify(run), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
