import OpenAI from 'openai'
import { submitToolOutputsRegexp } from '@/lib/runs/submitToolOutputsRegexp'
import { runs, threads } from '../../../../state'
import { RunAdapterPartobClient, ThreadWithConversationId } from '@/types'

export const post = ({
  openai,
  runAdapter,
}: {
  openai: OpenAI
  runAdapter: RunAdapterPartobClient
}) => async (urlString: string, options: any): Promise<Response> => {
  const url = new URL(urlString)
  const [, threadId, runId] = url.pathname.match(new RegExp(submitToolOutputsRegexp))!
  const body = JSON.parse(options.body)
  const { tool_outputs, stream } = body

  const thread = threads.get(threadId) as ThreadWithConversationId | undefined
  const run = runs.get(runId)
  if (!thread || !run) return new Response('Not found', { status: 404 })

  const base = (openai.baseURL || 'https://api.openai.com/v1').replace(/\/$/, '')
  await fetch(`${base}/conversations/${thread.openaiConversationId}/items`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openai.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: tool_outputs.map((t: any) => ({
        type: 'tool_output',
        call_id: t.tool_call_id,
        output: t.output,
      })),
    }),
  })

  const onEvent = async (event: OpenAI.Beta.AssistantStreamEvent) => {
    if (event.event === 'thread.run.completed') {
      runs.set(run.id, { ...run, status: 'completed' })
    } else if (event.event === 'thread.run.failed') {
      runs.set(run.id, { ...run, status: 'failed', last_error: event.data.last_error })
    }
    const conv = (event.data as any)?.metadata?.openaiConversationId
    if (conv) {
      thread.openaiConversationId = conv
      threads.set(thread.id, thread)
    }
    return event.data
  }

  const getThread = async () => thread
  const getMessages = async () => []

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
        controller.close()
      },
    })
    return new Response(readableStream, {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  await runAdapter({ run, onEvent, getMessages, getThread })
  return new Response(JSON.stringify(runs.get(run.id)), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
