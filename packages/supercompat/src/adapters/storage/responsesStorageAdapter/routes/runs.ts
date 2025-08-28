import type OpenAI from 'openai'
import type { RequestHandler, RunAdapter } from '@/types'
import { uid } from 'radash'
import dayjs from 'dayjs'

export const createRunsHandlers = ({
  openai,
  runAdapter,
  getAssistant,
  getConversationId,
  setConversationId,
  ensureConversation,
  onEventBridge,
  runs,
  runSteps,
  runLastResponseId,
}: {
  openai: OpenAI
  runAdapter: RunAdapter
  getAssistant: (assistantId: string) => Promise<{ model: string; instructions: string }>
  getConversationId: (threadId: string) => Promise<string | null>
  setConversationId: (threadId: string, convId: string) => Promise<void>
  ensureConversation: (threadId: string) => Promise<string>
  onEventBridge: (args: { controller?: ReadableStreamDefaultController }) => (e: OpenAI.Beta.AssistantStreamEvent) => Promise<any>
  runs: Map<string, OpenAI.Beta.Threads.Run>
  runSteps: Map<string, OpenAI.Beta.Threads.Runs.RunStep[]>
  runLastResponseId: Map<string, string>
}): { post: RequestHandler } => {
  const post: RequestHandler = async (url, options) => {
    const pathname = new URL(url).pathname
    const m = pathname.match(/^\/(?:v1|\/?openai)\/threads\/([^/]+)\/runs$/)!
    const threadId = m[1]
    const body = JSON.parse(options.body!)
    const assistantId = body.assistant_id
    const stream = !!body.stream

    const { model, instructions } = await getAssistant(assistantId)

    const runId = `run_${uid(24)}`
    const run: OpenAI.Beta.Threads.Run = {
      id: runId,
      object: 'thread.run',
      created_at: Math.floor(Date.now() / 1000),
      thread_id: threadId,
      assistant_id: assistantId,
      status: 'queued',
      required_action: null,
      last_error: null,
      expires_at: Math.floor(dayjs().add(1, 'hour').unix()),
      started_at: null,
      cancelled_at: null,
      failed_at: null,
      completed_at: null,
      model,
      instructions: body.instructions ?? instructions ?? '',
      tools: body.tools ?? [],
      metadata: body.metadata ?? {},
      usage: null,
      truncation_strategy: { type: 'auto' },
      response_format: { type: 'text' },
      incomplete_details: null,
      max_completion_tokens: null,
      max_prompt_tokens: null,
      tool_choice: 'auto',
      parallel_tool_calls: true,
    }

    runs.set(runId, run)
    runSteps.set(runId, [])

    const startRun = async (controller?: ReadableStreamDefaultController) => {
      await runAdapter({
        client: openai,
        run,
        onEvent: onEventBridge({ controller }),
        getAssistant,
        getConversationId: async () => await getConversationId(threadId),
        setConversationId: async (convId: string) => await setConversationId(threadId, convId),
        setLastResponseId: async (respId: string) => { runLastResponseId.set(run.id, respId) },
      })
    }

    if (stream) {
      const readable = new ReadableStream({
        async start(controller) {
          try { await startRun(controller) } finally { controller.close() }
        },
      })
      return new Response(readable, { headers: { 'Content-Type': 'text/event-stream' } })
    } else {
      void startRun().catch(() => {})
      const start = Date.now()
      while (Date.now() - start < 1500) {
        const r = runs.get(runId)
        const steps = runSteps.get(runId) ?? []
        const hasTool = steps.some((s: any) => s.step_details?.type === 'tool_calls' && s.step_details.tool_calls?.length)
        if (r?.status === 'requires_action' || r?.status === 'completed' || r?.status === 'failed' || hasTool) break
        await new Promise((res) => setTimeout(res, 40))
      }
      return new Response(JSON.stringify(run), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'openai-poll-after-ms': '500' },
      })
    }
  }
  return { post }
}

