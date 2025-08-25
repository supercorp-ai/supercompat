import OpenAI from 'openai'
import dayjs from 'dayjs'
import { uid } from 'radash'
import { runsRegexp } from '@/lib/runs/runsRegexp'
import {
  RunAdapterPartobClient,
  ThreadWithConversationId,
  MessageWithRun,
} from '@/types'

export const post =
  ({
    openai,
    runAdapter,
  }: {
    openai: OpenAI
    runAdapter: RunAdapterPartobClient
  }) =>
  async (urlString: string, options: any): Promise<Response> => {
    const url = new URL(urlString)
    const [, threadId] = url.pathname.match(new RegExp(runsRegexp))!
    const body = JSON.parse(options.body)
    const { assistant_id, stream } = body

    const oai = openai as any
    const conversation = await oai.conversations
      .retrieve(threadId)
      .catch(() => null)
    if (!conversation) return new Response('Thread not found', { status: 404 })

    const metadata = (conversation.metadata ?? {}) as Record<string, string>
    const openaiConversationId = metadata.openaiConversationId || threadId
    const thread: ThreadWithConversationId = {
      id: threadId,
      object: 'thread',
      created_at: conversation.created_at ?? dayjs().unix(),
      metadata,
      tool_resources: null,
      openaiConversationId,
    }

    const assistant = await openai.beta.assistants.retrieve(assistant_id)

    let run: OpenAI.Beta.Threads.Run = {
      id: `run_${uid(24)}`,
      object: 'thread.run',
      created_at: dayjs().unix(),
      thread_id: threadId,
      assistant_id,
      model: body.model || assistant.model,
      instructions: body.instructions || '',
      status: 'queued',
      tools: body.tools || (assistant.tools as unknown as OpenAI.Beta.AssistantTool[]) || [],
      response_format: body.response_format || { type: 'text' },
      metadata: body.metadata || {},
    } as unknown as OpenAI.Beta.Threads.Run

    const onEvent = async (event: OpenAI.Beta.AssistantStreamEvent) => {
      if (event.event === 'thread.run.completed') {
        run = { ...run, status: 'completed' }
      } else if (event.event === 'thread.run.failed') {
        run = {
          ...run,
          status: 'failed',
          last_error: event.data.last_error,
        } as any
      } else if (event.event === 'thread.run.requires_action') {
        run = {
          ...run,
          status: 'requires_action',
          required_action: event.data.required_action,
        } as any
      }
      const conv = (event.data as any)?.metadata?.openaiConversationId
      if (conv && conv !== thread.openaiConversationId) {
        thread.openaiConversationId = conv
      }
      return event.data
    }

    const getThread = async () => thread
    const getMessages = async (): Promise<MessageWithRun[]> => []

    const saveRun = async () => {
      if (run.status !== 'requires_action') {
        delete (run as any).required_action
      }
      const storedRun = {
        id: run.id,
        assistant_id: run.assistant_id,
        thread_id: run.thread_id,
        model: run.model,
        instructions: run.instructions,
        response_format: run.response_format,
        status: run.status,
      }
      const metadata = thread.metadata as Record<string, string>
      metadata[`run_${run.id}`] = JSON.stringify(storedRun)
      if (run.tools && run.tools.length > 0) {
        metadata[`run_${run.id}_tools`] = JSON.stringify(run.tools)
      }
      if ((run as any).required_action) {
        metadata[`run_${run.id}_required_action`] = JSON.stringify(
          (run as any).required_action,
        )
      }
      metadata.openaiConversationId = thread.openaiConversationId as string
      thread.metadata = metadata
      await oai.conversations.update(thread.openaiConversationId as string, {
        metadata,
      })
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
          await saveRun()
          controller.close()
        },
      })

      return new Response(readableStream, {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }

    await runAdapter({ run, onEvent, getMessages, getThread })
    await saveRun()

    return new Response(JSON.stringify(run), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
