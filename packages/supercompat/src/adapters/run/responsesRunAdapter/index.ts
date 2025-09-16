import dayjs from 'dayjs'
import { uid } from 'radash'
import type OpenAI from 'openai'

type AssistantEvent = OpenAI.Beta.AssistantStreamEvent

// Explicit types so nothing collapses to `never`
interface ToolCall {
  id: string // this is the call_id
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

interface AssistantMessage {
  id: string
  object: 'thread.message'
  role: 'assistant'
  thread_id: string
  run_id: string
  assistant_id: string
  created_at: number
  status: 'in_progress' | 'completed'
  content: Array<{ type: 'text'; text: { value: string; annotations: any[] } }>
}

export const responsesRunAdapter =
  ({
    openaiAssistant,
  }: {
    openaiAssistant: OpenAI.Beta.Assistants.Assistant
  }) =>
  async ({
    response,
    onEvent,
  }: {
    response: AsyncIterable<any>
    onEvent: (event: AssistantEvent) => Promise<any>
  }) => {
    const now = dayjs().unix()

    // Minimal synthetic run/message envelope
    const runId = `run_${uid(18)}`
    const threadId = `thread_${uid(18)}`
    let model = 'unknown'

    let msg: AssistantMessage = {
      id: `msg_${uid(18)}`,
      object: 'thread.message',
      role: 'assistant',
      thread_id: threadId,
      run_id: runId,
      assistant_id: openaiAssistant.id,
      created_at: now,
      status: 'in_progress',
      content: [{ type: 'text', text: { value: '', annotations: [] } }],
    }

    // ---- Tool call state
    // Map transient output item.id -> stable call_id
    const itemToCallId = new Map<string, string>()
    // Map stable call_id -> ToolCall accumulator
    const callsById = new Map<string, ToolCall>()
    // Keep order of appearance for the final list
    const callOrder: string[] = []
    let toolCallsStepId: string | null = null
    let sawToolCalls = false

    // ---- Emit Assistants-style boot events
    await onEvent({
      event: 'thread.run.created',
      data: {
        id: runId,
        object: 'thread.run',
        thread_id: threadId,
        assistant_id: openaiAssistant.id,
        created_at: now,
        status: 'queued',
        model,
      } as any,
    })
    await onEvent({
      event: 'thread.run.in_progress',
      data: {
        id: runId,
        object: 'thread.run',
        thread_id: threadId,
        assistant_id: openaiAssistant.id,
        created_at: now,
        status: 'in_progress',
        model,
      } as any,
    })
    await onEvent({ event: 'thread.message.created', data: msg as any })

    // ---- Helpers
    const ensureToolCallsStep = async () => {
      if (toolCallsStepId) return
      toolCallsStepId = `step_${uid(18)}`
      await onEvent({
        event: 'thread.run.step.created',
        data: {
          id: toolCallsStepId,
          object: 'thread.run.step',
          run_id: runId,
          assistant_id: openaiAssistant.id,
          thread_id: threadId,
          type: 'tool_calls',
          status: 'in_progress',
          created_at: dayjs().unix(),
          completed_at: null,
          step_details: { type: 'tool_calls', tool_calls: [] },
        } as any,
      })
    }

    // Create or fetch a ToolCall accumulator by call_id
    const getOrCreateToolCall = (callId: string, name?: string): ToolCall => {
      let tc = callsById.get(callId)
      if (!tc) {
        tc = {
          id: callId,
          type: 'function',
          function: { name: name || 'unknown_function', arguments: '' },
        }
        callsById.set(callId, tc)
        callOrder.push(callId)
      } else if (name && tc.function.name === 'unknown_function') {
        tc.function.name = name
      }
      return tc
    }

    // Emit a step delta reflecting the latest args chunk
    const emitToolArgsDelta = async (callId: string, name: string, argsDelta: string) => {
      if (!toolCallsStepId) return
      await onEvent({
        event: 'thread.run.step.delta',
        data: {
          object: 'thread.run.step.delta',
          run_id: runId,
          id: toolCallsStepId,
          delta: {
            step_details: {
              type: 'tool_calls',
              tool_calls: [
                {
                  id: callId, // IMPORTANT: stable call_id in deltas too
                  type: 'function',
                  function: { name, arguments: argsDelta || '' },
                },
              ],
            },
          },
        } as any,
      })
    }

    // Mark the tool_calls step as completed (optional cosmetic)
    const completeToolCallsStep = async () => {
      if (!toolCallsStepId) return
      await onEvent({
        event: 'thread.run.step.completed',
        data: {
          id: toolCallsStepId,
          object: 'thread.run.step',
          run_id: runId,
          assistant_id: openaiAssistant.id,
          thread_id: threadId,
          type: 'tool_calls',
          status: 'completed',
          created_at: now,
          completed_at: dayjs().unix(),
          step_details: {
            type: 'tool_calls',
            tool_calls: callOrder.map((cid) => callsById.get(cid)),
          },
        } as any,
      })
    }

    // ---- Stream mapping
    try {
      for await (const evt of response as any as AsyncIterable<any>) {
        const t = evt?.type
        if (evt?.response?.model) model = evt.response.model

        switch (t) {
          // lifecycle
          case 'response.created':
          case 'response.in_progress':
            break

          case 'response.completed': {
            await onEvent({
              event: 'thread.message.completed',
              data: { ...msg, status: 'completed' } as any,
            })

            if (sawToolCalls) {
              await completeToolCallsStep()
              const finalCalls = callOrder
                .map((cid) => callsById.get(cid)!)
                .filter(Boolean)

              await onEvent({
                event: 'thread.run.requires_action',
                data: {
                  id: runId,
                  object: 'thread.run',
                  thread_id: threadId,
                  assistant_id: openaiAssistant.id,
                  status: 'requires_action',
                  required_action: {
                    type: 'submit_tool_outputs',
                    submit_tool_outputs: {
                      // IMPORTANT: these must be keyed by stable call_id
                      tool_calls: finalCalls,
                    },
                  },
                } as any,
              })
            } else {
              await onEvent({
                event: 'thread.run.completed',
                data: {
                  id: runId,
                  object: 'thread.run',
                  thread_id: threadId,
                  assistant_id: openaiAssistant.id,
                  status: 'completed',
                  completed_at: dayjs().unix(),
                } as any,
              })
            }
            break
          }

          case 'response.error': {
            await onEvent({
              event: 'thread.run.failed',
              data: {
                id: runId,
                object: 'thread.run',
                thread_id: threadId,
                assistant_id: openaiAssistant.id,
                status: 'failed',
                failed_at: dayjs().unix(),
                last_error: {
                  code: evt?.error?.code || 'server_error',
                  message: evt?.error?.message || 'Unknown error',
                },
              } as any,
            })
            break
          }

          // text streaming
          case 'response.output_text.delta': {
            const delta = typeof evt?.delta === 'string' ? evt.delta : ''

            await onEvent({
              event: 'thread.message.delta',
              data: {
                id: msg.id,
                delta: {
                  content: [{ type: 'text', index: 0, text: { value: delta } }],
                },
              } as any,
            })

            msg.content[0].text.value += delta

            break
          }
          case 'response.output_text.done': {
            const finalText = typeof evt?.text === 'string' ? evt.text : ''

            await onEvent({
              event: 'thread.message.completed',
              data: {
                id: msg.id,
                object: 'thread.message',
                role: 'assistant',
                thread_id: threadId,
                run_id: runId,
                assistant_id: openaiAssistant.id,
                created_at: msg.created_at,
                status: 'completed',
                content: [{ type: 'text', text: { value: finalText, annotations: [] } }],
              } as any
            })

            break
          }

          // structure markers some SDKs surface
          case 'response.output_item.added': {
            // When an item is added and it's a function_call, capture the mapping:
            // item.id (transient) -> call_id (stable)
            const item = evt?.item
            if (item?.type === 'function_call') {
              const itemId = item?.id
              const callId = item?.call_id // <- stable!
              const name = item?.name as string | undefined

              if (itemId && callId) {
                itemToCallId.set(itemId, callId)
                // Also ensure accumulator exists with optional name
                getOrCreateToolCall(callId, name)
                await ensureToolCallsStep()
                sawToolCalls = true
              }
            }
            break
          }

          case 'response.output_item.done':
            // no-op; we finalize on response.completed
            break

          // function calling / tools
          case 'response.function_call_arguments.delta': {
            // Deltas are associated with the transient output item id
            const itemId = evt?.item_id as string | undefined
            const argsDelta = typeof evt?.delta === 'string' ? evt.delta : ''
            const maybeName = typeof evt?.name === 'string' ? evt.name : undefined

            if (!itemId) break
            const callId = itemToCallId.get(itemId)
            if (!callId) {
              // Some SDKs omit output_item.added; fallback: derive from evt if present
              const fallbackCallId = evt?.call_id as string | undefined
              if (!fallbackCallId) break
              itemToCallId.set(itemId, fallbackCallId)
            }

            const effectiveCallId = itemToCallId.get(itemId)!
            const tc = getOrCreateToolCall(effectiveCallId, maybeName)
            tc.function.arguments += argsDelta
            if (maybeName && tc.function.name === 'unknown_function') {
              tc.function.name = maybeName
            }

            await ensureToolCallsStep()
            sawToolCalls = true
            await emitToolArgsDelta(effectiveCallId, tc.function.name, argsDelta)
            break
          }

          case 'response.function_call_arguments.done': {
            // Nothing to do; we've already aggregated via deltas.
            break
          }

          default:
            // ignore other event types (reasoning spans, etc.)
            break
        }
      }
    } catch (e: any) {
      await onEvent({
        event: 'thread.run.failed',
        data: {
          id: runId,
          object: 'thread.run',
          thread_id: threadId,
          assistant_id: openaiAssistant.id,
          status: 'failed',
          failed_at: dayjs().unix(),
          last_error: {
            code: 'server_error',
            message: String(e?.message || e || 'Unknown error'),
          },
        } as any,
      })
    }
  }
