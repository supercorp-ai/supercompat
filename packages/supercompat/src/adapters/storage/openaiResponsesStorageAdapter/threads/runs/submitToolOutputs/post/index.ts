import OpenAI from 'openai'
import { submitToolOutputsRegexp } from '@/lib/runs/submitToolOutputsRegexp'
import { RunAdapterPartobClient, ThreadWithConversationId } from '@/types'
import dayjs from 'dayjs'


export const post = ({
  openai,
  runAdapter,
}: {
  openai: OpenAI
  runAdapter: RunAdapterPartobClient
}) =>
async (
  urlString: string,
  options: RequestInit & { body: string },
): Promise<Response> => {
  const url = new URL(urlString)
  let threadId: string
  let runId: string
  let body: {
    tool_outputs?: OpenAI.Beta.Threads.RunSubmitToolOutputsParams.ToolOutput[]
    stream?: boolean
    thread_id?: string
  }
  const match = url.pathname.match(new RegExp(submitToolOutputsRegexp))
  ;[, threadId, runId] = match!
  body = JSON.parse(options.body)
  const { tool_outputs, stream } = body

  const oai = openai as any
  const conversation = await oai.conversations
    .retrieve(threadId)
    .catch(() => null)
  if (!conversation) return new Response('Not found', { status: 404 })

  const metadata = (conversation.metadata ?? {}) as Record<string, string>
  const openaiConversationId = metadata.openaiConversationId || threadId
  const thread: ThreadWithConversationId = {
    id: openaiConversationId,
    object: 'thread',
    created_at: conversation.created_at ?? dayjs().unix(),
    metadata,
    tool_resources: null,
    openaiConversationId,
  }
  const runStr = metadata[`run_${runId}`]
  const toolsStr = metadata[`run_${runId}_tools`]
  const raStr = metadata[`run_${runId}_required_action`]
  const run: OpenAI.Beta.Threads.Run | undefined = runStr
    ? {
        ...JSON.parse(runStr),
        tools: toolsStr ? JSON.parse(toolsStr) : [],
        ...(raStr ? { required_action: JSON.parse(raStr) } : {}),
      }
    : undefined
  if (!run) return new Response('Not found', { status: 404 })
  run.status = 'completed'
  run.required_action = null
  run.last_error = null

  if (tool_outputs && tool_outputs.length > 0) {
    await oai.conversations.items.create(thread.openaiConversationId as string, {
      items: [
        ...tool_outputs.map(
          (t: OpenAI.Beta.Threads.RunSubmitToolOutputsParams.ToolOutput) => ({
            type: 'function_call_output',
            call_id: t.tool_call_id,
            output:
              typeof t.output === 'string'
                ? t.output
                : JSON.stringify(t.output),
          }),
        ),
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: tool_outputs[0].output,
            },
          ],
        },
      ],
    })
  }

  const saveRun = async () => {
    if (run.status !== 'requires_action') {
      run.required_action = null
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
    metadata[`run_${run.id}`] = JSON.stringify(storedRun)
    if (run.tools && run.tools.length > 0) {
      metadata[`run_${run.id}_tools`] = JSON.stringify(run.tools)
    }
    if (run.required_action) {
      metadata[`run_${run.id}_required_action`] = JSON.stringify(
        run.required_action,
      )
    } else {
      delete metadata[`run_${run.id}_required_action`]
    }
    metadata.openaiConversationId = thread.openaiConversationId as string
    thread.metadata = metadata
    await oai.conversations.update(thread.openaiConversationId as string, {
      metadata,
    })
  }

  await saveRun()

  if (stream) {
    const readableStream = new ReadableStream({
      start(controller) {
        controller.enqueue(`data: ${JSON.stringify({
          event: 'thread.run.completed',
          data: run,
        })}\n\n`)
        controller.close()
      },
    })
    return new Response(readableStream, {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  return new Response(JSON.stringify(run), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
