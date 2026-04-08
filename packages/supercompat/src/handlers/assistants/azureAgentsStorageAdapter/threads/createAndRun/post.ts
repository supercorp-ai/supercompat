import type OpenAI from 'openai'
import type { AIProjectClient } from '@azure/ai-projects'
import dayjs from 'dayjs'
import type { RunAdapterWithAssistant } from '@/types'
import type { RequestHandler } from '@/types'
import { enqueueSSE } from '@/lib/sse/enqueueSSE'
import { uid } from 'radash'

export const post = ({
  azureAiProject,
  runAdapter,
}: {
  azureAiProject: AIProjectClient
  runAdapter: RunAdapterWithAssistant
}): RequestHandler => async (_urlString: string, options: RequestInit & { body?: string }) => {
  if (typeof options.body !== 'string') {
    throw new Error('Request body is required')
  }

  const body = JSON.parse(options.body)
  const { assistant_id, stream, thread: threadParams, instructions, tools } = body

  if (!assistant_id) {
    throw new Error('assistant_id is required')
  }

  // Create thread and run in one call via Azure SDK
  const azureRun = await azureAiProject.agents.runs.createThreadAndRun(assistant_id, {
    thread: threadParams ? {
      messages: threadParams.messages?.map((m: any) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })),
      metadata: threadParams.metadata,
    } : undefined,
    instructions,
    tools,
  })

  const runData: OpenAI.Beta.Threads.Run = {
    id: azureRun.id,
    object: 'thread.run',
    created_at: dayjs(azureRun.createdAt).unix(),
    thread_id: azureRun.threadId,
    assistant_id,
    status: azureRun.status as any,
    required_action: null,
    last_error: null,
    expires_at: null,
    started_at: azureRun.startedAt ? dayjs(azureRun.startedAt).unix() : null,
    cancelled_at: null,
    failed_at: null,
    completed_at: null,
    incomplete_details: null,
    model: azureRun.model || '',
    instructions: azureRun.instructions || '',
    tools: [],
    metadata: azureRun.metadata || {},
    temperature: null,
    top_p: null,
    max_prompt_tokens: null,
    max_completion_tokens: null,
    truncation_strategy: { type: 'auto', last_messages: null },
    response_format: 'auto',
    tool_choice: 'auto',
    parallel_tool_calls: true,
    usage: null,
  }

  if (stream) {
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          await runAdapter.handleRun({
            threadId: azureRun.threadId,
            assistantId: assistant_id,
            instructions,
            tools,
            onEvent: async (event: any) => {
              enqueueSSE(controller, event.event, event.data)
            },
          } as any)
        } catch (error: any) {
          enqueueSSE(controller, 'thread.run.failed', {
            id: uid(24),
            failed_at: dayjs().unix(),
            last_error: {
              code: 'server_error',
              message: `${error?.message ?? ''} ${error?.cause?.message ?? ''}`,
            },
          })
        }
        controller.close()
      },
    })

    return new Response(readableStream, {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  return new Response(JSON.stringify(runData), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
