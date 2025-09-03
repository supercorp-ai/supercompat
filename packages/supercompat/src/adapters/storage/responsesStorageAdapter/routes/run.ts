import type OpenAI from 'openai'
import type { RequestHandler } from '@/types'

export const createRunHandlers = ({
  openai,
  runs,
  runSteps,
  getConversationId,
  runCompletedAfterTool,
  runToolSubmitted,
}: {
  openai: OpenAI
  runs: Map<string, OpenAI.Beta.Threads.Run>
  runSteps: Map<string, OpenAI.Beta.Threads.Runs.RunStep[]>
  getConversationId: (threadId: string) => Promise<string | null>
  runCompletedAfterTool: Map<string, boolean>
  runToolSubmitted: Map<string, boolean>
}): { get: RequestHandler } => {
  const get: RequestHandler = async (url) => {
    const pathname = new URL(url).pathname
    const m = pathname.match(/^\/(?:v1|\/?openai)\/threads\/([^/]+)\/runs\/([^/]+)$/)!
    const threadId = m[1]
    const runId = m[2]
    let run = runs.get(runId)
    if (!run) {
      return new Response(JSON.stringify({ id: runId, object: 'thread.run', status: 'queued' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'openai-poll-after-ms': '500' },
      })
    }
    if (run.status !== 'requires_action' && run.status !== 'completed') {
      const start = Date.now()
      if (run.status === 'in_progress') {
        while (Date.now() - start < 2500) {
          const stepsNow = runSteps.get(runId) ?? []
          const hasToolNow = stepsNow.some((s: any) => s.step_details?.type === 'tool_calls' && s.step_details.tool_calls?.length)
          if (hasToolNow) break
          await new Promise((res) => setTimeout(res, 40))
        }
      }
      const stepsNow = runSteps.get(runId) ?? []
      const toolStepNow = stepsNow.find((s: any) => s.step_details?.type === 'tool_calls') as any
      if (toolStepNow?.step_details?.tool_calls?.length) {
        const tool_calls = toolStepNow.step_details.tool_calls.map((tc: any) => ({
            id: tc.id ?? tc.call_id ?? Math.random().toString(36).slice(2),
            type: 'function',
            function: { name: tc.function?.name ?? tc.name, arguments: tc.function?.arguments ?? tc.arguments ?? '' },
          }))
        run = { ...run, status: 'requires_action', required_action: { type: 'submit_tool_outputs', submit_tool_outputs: { tool_calls } } }
        runs.set(runId, run)
      }
      // Fallback: if no steps yet, peek conversation for function_call items
      if (run.status !== 'requires_action') {
        try {
          const convId = await getConversationId(threadId)
          if (convId) {
            const page = await openai.conversations.items.list(convId, { order: 'desc' })
            const calls: any[] = []
            for await (const it of page) {
              if ((it as any).type === 'function_call') {
                calls.push({
                  id: (it as any).call_id,
                  type: 'function',
                  function: { name: (it as any).name, arguments: (it as any).arguments ?? '' },
                })
              }
            }
            if (calls.length) {
              run = { ...run, status: 'requires_action', required_action: { type: 'submit_tool_outputs', submit_tool_outputs: { tool_calls: calls } } }
              runs.set(runId, run)
            }
          }
        } catch {}
      }
    }
    // If we recorded completion after tool outputs, mark completed
    if (runCompletedAfterTool.get(runId)) {
      run = { ...run, status: 'completed', completed_at: Math.floor(Date.now()/1000) }
      runs.set(runId, run)
    }
    if (run.status === 'requires_action') {
      try {
        const convId = await getConversationId(threadId)
        if (convId) {
          const list = await openai.conversations.items.list(convId, { order: 'desc' })
          let sawOutput = false
          let sawAssistant = false
          for await (const it of list) {
            const t = (it as any).type
            if (t === 'message' && (it as any).role === 'assistant') {
              const text = (it as any).content?.find?.((c: any) => c.type === 'output_text')?.text
              if (typeof text === 'string' && text.length > 0) { sawAssistant = true; break }
            }
            if (t === 'function_call_output') sawOutput = true
          }
          if (sawAssistant || sawOutput) {
            run = { ...run, status: 'completed', completed_at: Math.floor(Date.now()/1000) }
            runs.set(runId, run)
          }
        }
      } catch {}
    }
    // Final safeguard: if tool outputs submitted, prefer completed
    if (run.status === 'requires_action' && runToolSubmitted.get(runId)) {
      run = { ...run, status: 'completed', completed_at: Math.floor(Date.now()/1000) }
      runs.set(runId, run)
    }
    return new Response(JSON.stringify(run), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'openai-poll-after-ms': '500' },
    })
  }
  return { get }
}
