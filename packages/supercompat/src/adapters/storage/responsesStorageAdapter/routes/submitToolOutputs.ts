import type OpenAI from 'openai'
import type { RequestHandler, RunAdapter } from '@/types'

export const createSubmitToolOutputsHandlers = ({
  openai,
  runAdapter,
  runs,
  onEventBridge,
  getConversationId,
  ensureConversation,
  setConversationId,
  getAssistant,
  runLastResponseId,
  threadLastAssistant,
  runCompletedAfterTool,
  runToolSubmitted,
}: {
  openai: OpenAI
  runAdapter: RunAdapter
  runs: Map<string, OpenAI.Beta.Threads.Run>
  onEventBridge: (args: { controller?: ReadableStreamDefaultController }) => (e: OpenAI.Beta.AssistantStreamEvent) => Promise<any>
  getConversationId: (threadId: string) => Promise<string | null>
  ensureConversation: (threadId: string) => Promise<string>
  setConversationId: (threadId: string, convId: string) => Promise<void>
  getAssistant: (assistantId: string) => Promise<{ model: string; instructions: string }>
  runLastResponseId: Map<string, string>
  threadLastAssistant: Map<string, { id: string; text: string; created_at: number }>
  runCompletedAfterTool: Map<string, boolean>
  runToolSubmitted: Map<string, boolean>
}): { post: RequestHandler } => {
  const post: RequestHandler = async (url, options) => {
    const pathname = new URL(url).pathname
    const m = pathname.match(/^\/(?:v1|\/?openai)\/threads\/([^/]+)\/runs\/([^/]+)\/submit_tool_outputs$/)!
    const threadId = m[1]
    const runId = m[2]
    const body = JSON.parse(options.body!)
    const { tool_outputs, stream } = body
    const convId = await ensureConversation(threadId)
    const existingRun = runs.get(runId)
    if (!existingRun) return new Response(JSON.stringify({ error: 'run not found' }), { status: 404 })

    const startRun = async (controller?: ReadableStreamDefaultController) => {
      const resumed = { ...existingRun, status: 'queued', required_action: null }
      runs.set(runId, resumed)
      runToolSubmitted.set(runId, true)
      const wantId = tool_outputs?.[0]?.tool_call_id as string | undefined
      if (wantId) {
        for (let i = 0; i < 10; i++) {
          try {
            const page = await openai.conversations.items.list(convId, { order: 'desc' })
            let found = false
            for await (const it of page) {
              if ((it as any).type === 'function_call' && (it as any).call_id === wantId) { found = true; break }
            }
            if (found) break
          } catch {}
          await new Promise((r) => setTimeout(r, 100))
        }
      }
      {
        let ok = false
        for (let i = 0; i < 5; i++) {
          try {
            await openai.conversations.items.create(convId, {
              items: tool_outputs.map((t: any) => ({ type: 'function_call_output', call_id: t.tool_call_id, output: String(t.output ?? '') })),
            })
            ok = true
            break
          } catch {
            await new Promise((r) => setTimeout(r, 150))
          }
        }
        if (!ok) {
          // continue anyway
        }
      }

      await runAdapter({
        client: openai,
        run: resumed,
        onEvent: onEventBridge({ controller }),
        getAssistant,
        getConversationId: async () => await getConversationId(threadId),
        setConversationId: async (convId2: string) => await setConversationId(threadId, convId2),
        inputItems: tool_outputs.map((t: any) => ({ type: 'function_call_output', call_id: t.tool_call_id, output: String(t.output ?? '') })) as any,
        previousResponseId: runLastResponseId.get(runId) ?? null,
        setLastResponseId: async (respId: string) => { runLastResponseId.set(runId, respId) },
      })
      try {
        const list = await openai.conversations.items.list(convId, { order: 'asc' })
        let lastMsg: any = null
        for await (const it of list) { if ((it as any).type === 'message' && (it as any).role === 'assistant') lastMsg = it }
        if (lastMsg) {
          threadLastAssistant.set(threadId, {
            id: lastMsg.id,
            text: (lastMsg.content?.find?.((c: any) => c.type === 'output_text')?.text ?? '') as string,
            created_at: Math.floor(Date.now()/1000),
          })
        }
        // If no assistant message yet, synthesize from last function_call_output
        if (!threadLastAssistant.get(threadId)) {
          const list2 = await openai.conversations.items.list(convId, { order: 'asc' })
          let lastOutput: string | null = null
          for await (const it of list2) {
            if ((it as any).type === 'function_call_output' && typeof (it as any).output === 'string') {
              lastOutput = (it as any).output as string
            }
          }
          if (lastOutput) {
            threadLastAssistant.set(threadId, {
              id: `msg_${Math.random().toString(36).slice(2)}`,
              text: lastOutput,
              created_at: Math.floor(Date.now()/1000),
            })
          }
        }
      } catch {}
      const r = runs.get(runId)
      if (r && r.status !== 'completed') {
        runs.set(runId, { ...r, status: 'completed', completed_at: Math.floor(Date.now()/1000) })
      }
      runCompletedAfterTool.set(runId, true)
    }

    if (stream) {
      const readable = new ReadableStream({
        async start(controller) { try { await startRun(controller) } finally { controller.close() } },
      })
      return new Response(readable, { headers: { 'Content-Type': 'text/event-stream' } })
    } else {
      await startRun().catch(() => {})
      return new Response(JSON.stringify(existingRun), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
  }
  return { post }
}
