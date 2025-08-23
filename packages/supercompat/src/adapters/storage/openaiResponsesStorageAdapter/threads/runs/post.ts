import OpenAI from 'openai'
import dayjs from 'dayjs'
import { uid } from 'radash'
import { runsRegexp } from '@/lib/runs/runsRegexp'
import {
  RunAdapterPartobClient,
  ThreadWithConversationId,
  MessageWithRun,
} from '@/types'

export const post = ({
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

    const thread: ThreadWithConversationId = {
      id: threadId,
      object: 'thread',
      created_at: conversation.created_at ?? dayjs().unix(),
      metadata: (conversation.metadata ?? {}) as Record<string, string>,
      tool_resources: null,
      openaiConversationId: threadId,
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
      tools: body.tools || [],
      response_format: body.response_format || { type: 'text' },
      metadata: body.metadata || {},
    } as any

    const onEvent = async (event: OpenAI.Beta.AssistantStreamEvent) => {
      if (event.event === 'thread.run.completed') {
        run = { ...run, status: 'completed' }
      } else if (event.event === 'thread.run.failed') {
        run = { ...run, status: 'failed', last_error: event.data.last_error } as any
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
    const getMessages = async (): Promise<MessageWithRun[]> => {
      const items = await oai.conversations.items.list(
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

    const saveRun = async () => {
      thread.metadata = {
        ...(thread.metadata as Record<string, string>),
        [`run_${run.id}`]: JSON.stringify(run),
      }
      await oai.conversations.update(
        thread.openaiConversationId as string,
        { metadata: thread.metadata },
      )
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
