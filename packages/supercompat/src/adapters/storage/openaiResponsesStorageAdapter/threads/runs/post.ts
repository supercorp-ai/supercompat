import OpenAI from 'openai'
import dayjs from 'dayjs'
import { uid } from 'radash'
import { runsRegexp } from '@/lib/runs/runsRegexp'
import { RunAdapterPartobClient, ThreadWithConversationId } from '@/types'
import { runs, threads } from '../../state'

export const post = ({
  openai,
  runAdapter,
}: {
  openai: OpenAI
  runAdapter: RunAdapterPartobClient
}) => async (urlString: string, options: any): Promise<Response> => {
  const url = new URL(urlString)
  const [, threadId] = url.pathname.match(new RegExp(runsRegexp))!
  const body = JSON.parse(options.body)
  const { assistant_id, stream } = body

  const thread = threads.get(threadId) as ThreadWithConversationId | undefined
  if (!thread) {
    return new Response('Thread not found', { status: 404 })
  }

  const assistant = await openai.beta.assistants.retrieve(assistant_id)

  const run: any = {
    id: `run_${uid(24)}`,
    object: 'thread.run',
    created_at: dayjs().unix(),
    thread_id: threadId,
    assistant_id,
    model: body.model || assistant.model,
    instructions: body.instructions || '',
    status: 'queued' as const,
    tools: body.tools || [],
    response_format: body.response_format || { type: 'text' },
    metadata: body.metadata || {},
  }

  runs.set(run.id, run)

  const onEvent = async (event: OpenAI.Beta.AssistantStreamEvent) => {
    if (event.event === 'thread.run.completed') {
      runs.set(run.id, { ...run, status: 'completed' })
    } else if (event.event === 'thread.run.failed') {
      runs.set(run.id, { ...run, status: 'failed', last_error: event.data.last_error })
    } else if (event.event === 'thread.run.requires_action') {
      runs.set(run.id, { ...run, status: 'requires_action', required_action: event.data.required_action })
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
