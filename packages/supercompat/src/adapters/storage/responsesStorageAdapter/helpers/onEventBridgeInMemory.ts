import OpenAI from 'openai'
import { uid } from 'radash'

export const onEventBridgeInMemory = ({
  controller,
  runs,
  runSteps,
  threadLastAssistant,
  runCompletedAfterTool,
}: {
  controller?: ReadableStreamDefaultController
  runs: Map<string, OpenAI.Beta.Threads.Run>
  runSteps: Map<string, OpenAI.Beta.Threads.Runs.RunStep[]>
  threadLastAssistant: Map<string, { id: string; text: string; created_at: number }>
  runCompletedAfterTool?: Map<string, boolean>
}) =>
  async (event: OpenAI.Beta.AssistantStreamEvent) => {
    if (event.event === 'thread.run.in_progress') {
      const run = event.data
      const prev = runs.get(run.id)
      runs.set(run.id, { ...(prev ?? run), status: 'in_progress' })
    }
    if (event.event === 'thread.run.requires_action') {
      const run = event.data
      const prev = runs.get(run.id)
      runs.set(run.id, { ...(prev ?? run), status: 'requires_action', required_action: run.required_action })
    }
    if (event.event === 'thread.run.completed') {
      const run = event.data
      const prev = runs.get(run.id)
      runs.set(run.id, { ...(prev ?? run), status: 'completed', completed_at: run.completed_at ?? Math.floor(Date.now() / 1000) })
      runCompletedAfterTool?.set(run.id, true)
    }
    if (event.event === 'thread.run.failed') {
      const run = event.data as any
      const prev = runs.get(run.id)
      runs.set(run.id, { ...(prev ?? (run as any)), status: 'failed', failed_at: run.failed_at ?? Math.floor(Date.now() / 1000) } as any)
    }

    if (event.event === 'thread.run.step.created') {
      const step = event.data as OpenAI.Beta.Threads.Runs.RunStep
      const list = runSteps.get(step.run_id) ?? []
      const assigned = {
        ...step,
        id: step.id === 'THERE_IS_A_BUG_IN_SUPERCOMPAT_IF_YOU_SEE_THIS_ID' ? `step_${uid(24)}` : step.id,
      }
      runSteps.set(step.run_id, [...list, assigned])
      const payload = { ...event, data: assigned }
      controller?.enqueue(`data: ${JSON.stringify(payload)}\n\n`)
      return assigned
    }

    if (event.event === 'thread.run.step.delta') {
      const delta: any = event.data
      const list = runSteps.get(delta.run_id) ?? []
      const idx = list.findIndex((s) => s.id === delta.id)
      if (idx >= 0) {
        const existing = list[idx]
        const merged: any = { ...existing }
        if (delta.delta?.step_details?.type === 'tool_calls') {
          const prevCalls = ((existing as any).step_details?.tool_calls ?? []) as any[]
          const addCalls = delta.delta.step_details.tool_calls ?? []
          merged.step_details = { type: 'tool_calls', tool_calls: [...prevCalls, ...addCalls] }
        }
        list[idx] = merged
        runSteps.set(delta.run_id, list)
      }
      controller?.enqueue(`data: ${JSON.stringify(event)}\n\n`)
      return
    }

    if (event.event === 'thread.message.created') {
      const msg = event.data as any
      const assigned = {
        ...msg,
        id: msg.id === 'THERE_IS_A_BUG_IN_SUPERCOMPAT_IF_YOU_SEE_THIS_ID' ? `msg_${uid(24)}` : msg.id,
      }
      const payload = { ...event, data: assigned }
      controller?.enqueue(`data: ${JSON.stringify(payload)}\n\n`)
      return assigned
    }

    if (event.event === 'thread.message.delta') {
      controller?.enqueue(`data: ${JSON.stringify(event)}\n\n`)
      return
    }

    if (event.event === 'thread.message.completed') {
      const msg = event.data as any
      const text = (msg?.content?.[0]?.text?.value ?? '') as string
      if (text) {
        threadLastAssistant.set(msg.thread_id, {
          id: msg.id,
          text,
          created_at: msg.created_at ?? Math.floor(Date.now() / 1000),
        })
      }
      controller?.enqueue(`data: ${JSON.stringify(event)}\n\n`)
      return
    }

    controller?.enqueue(`data: ${JSON.stringify(event)}\n\n`)
    return (event as any).data
  }
