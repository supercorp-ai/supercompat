import dayjs from 'dayjs'
import OpenAI from 'openai'
import { uid } from 'radash'

export const responsesRunAdapter = () => async ({
  client,
  run,
  onEvent,
  getAssistant,
  getConversationId,
  setConversationId,
  inputItems,
  previousResponseId,
  setLastResponseId,
}: {
  client: OpenAI
  run: OpenAI.Beta.Threads.Run
  onEvent: (event: OpenAI.Beta.AssistantStreamEvent) => Promise<any>
  getAssistant: (assistantId: string) => Promise<{ model: string; instructions?: string | null }>
  getConversationId: () => Promise<string | null>
  setConversationId: (conversationId: string) => Promise<void>
  inputItems?: OpenAI.Responses.ResponseInput
  previousResponseId?: string | null
  setLastResponseId?: (responseId: string) => Promise<void> | void
}) => {
  if (run.status !== 'queued') return

  await onEvent({
    event: 'thread.run.in_progress',
    data: { ...run, status: 'in_progress' },
  })

  // Ensure conversation exists
  let conversationId = await getConversationId()
  if (!previousResponseId) {
    if (!conversationId) {
      const conv = await client.conversations.create({ metadata: { thread_id: run.thread_id } })
      conversationId = conv.id
      await setConversationId(conversationId)
    }
  }

  const { model, instructions } = await getAssistant(run.assistant_id)

  const mapTools = (run.tools || []).flatMap((t: any) => {
    if (t.type !== 'function') return []
    const fn = t.function
    let parameters = fn.parameters ?? null
    let strict: boolean | undefined = undefined
    try {
      if (parameters && typeof parameters === 'object' && (parameters as any).type === 'object') {
        const props = Object.keys(((parameters as any).properties ?? {}) as any)
        const required = Array.isArray((parameters as any).required) ? (parameters as any).required as string[] : []
        const hasAllRequired = props.every((k) => required.includes(k))
        const hasAdditional = (parameters as any).additionalProperties !== false
        if (!hasAdditional) {
          strict = hasAllRequired
        } else {
          // If additionalProperties not set, default to false for stricter mode
          parameters = { ...(parameters as any), additionalProperties: false }
          strict = hasAllRequired
        }
      }
    } catch {}
    return [{
      type: 'function',
      name: fn.name,
      description: fn.description ?? undefined,
      parameters,
      // Encourage tool use by defaulting to strict
      strict: strict ?? true,
    }]
  }) as OpenAI.Responses.FunctionTool[]

  // Track state
  let message: any | null = null
  let toolCallsRunStep: any | null = null
  let textBuffer = ''
  const toolCallByItemId = new Map<string, { call_id: string; name: string; arguments: string }>()
  const toolCallDone = new Set<string>()

  try {
    // Try to seed input with the latest user message from the conversation
    let latestUserText = ''
    if (!previousResponseId && conversationId) {
      try {
        const page = await client.conversations.items.list(conversationId, { order: 'desc' })
        for await (const item of page) {
          if ((item as any).type === 'message' && (item as any).role === 'user') {
            const content: any[] = (item as any).content ?? []
            const txt = (content.find((c: any) => c.type === 'input_text')?.text ?? content.find((c: any) => c.type === 'text')?.text ?? '') as string
            latestUserText = String(txt ?? '')
            break
          }
        }
      } catch {}
    }

    const hasToolOutputs = Array.isArray(inputItems) && (inputItems as any[]).some((it: any) => it?.type === 'function_call_output')
    const includeTools = mapTools.length > 0 && !hasToolOutputs
    const singleTool = includeTools && mapTools.length === 1 ? mapTools[0] : null
    const body: any = {
      model,
      input: (inputItems && (inputItems as any[]).length > 0) ? (inputItems as any) : (latestUserText ?? ''),
      ...(instructions || run.instructions ? { instructions: (run.instructions || instructions || '') as any } : {}),
      ...(includeTools ? { tools: mapTools, parallel_tool_calls: true, tool_choice: 'required' as const } : {}),
      ...(singleTool ? { tool_choice: { type: 'function', name: singleTool.name } } : {}),
    }
    if (previousResponseId) {
      body.previous_response_id = previousResponseId
    } else if (conversationId) {
      body.conversation = { id: conversationId }
    }
    let stream: any
    try {
      stream = await client.responses.stream(body as any)
    } catch (err: any) {
      const code = err?.code || err?.error?.code
      if (code === 'previous_response_not_found' && body.previous_response_id) {
        try {
          // Fallback: drop previous_response_id and use conversation instead
          const retryBody: any = { ...body }
          delete retryBody.previous_response_id
          if (conversationId) retryBody.conversation = { id: conversationId }
          stream = await client.responses.stream(retryBody as any)
        } catch (err2) {
          throw err2
        }
      } else {
        throw err
      }
    }

    let responseId: string | null = null
    for await (const evt of stream) {
      switch (evt.type) {
        case 'response.created': {
          responseId = (evt as any).response?.id ?? responseId
          if (responseId && setLastResponseId) await setLastResponseId(responseId)
          break
        }
        case 'response.in_progress': {
          await onEvent({ event: 'thread.run.in_progress', data: { ...run, status: 'in_progress' } })
          break
        }
        case 'response.output_item.added': {
          const item: any = (evt as any).item
          if (item.type === 'message' && item.role === 'assistant') {
            if (!message) {
              message = await onEvent({
                event: 'thread.message.created',
                data: {
                  id: 'THERE_IS_A_BUG_IN_SUPERCOMPAT_IF_YOU_SEE_THIS_ID',
                  object: 'thread.message',
                  completed_at: null,
                  run_id: run.id,
                  created_at: dayjs().unix(),
                  assistant_id: run.assistant_id,
                  incomplete_at: null,
                  incomplete_details: null,
                  metadata: {},
                  attachments: [],
                  thread_id: run.thread_id,
                  content: [{ text: { value: '', annotations: [] }, type: 'text' }],
                  role: 'assistant',
                  status: 'in_progress',
                },
              })

              await onEvent({
                event: 'thread.run.step.created',
                data: {
                  id: 'THERE_IS_A_BUG_IN_SUPERCOMPAT_IF_YOU_SEE_THIS_ID',
                  object: 'thread.run.step',
                  run_id: run.id,
                  assistant_id: run.assistant_id,
                  thread_id: run.thread_id,
                  type: 'message_creation',
                  status: 'completed',
                  completed_at: dayjs().unix(),
                  created_at: dayjs().unix(),
                  expired_at: null,
                  last_error: null,
                  metadata: {},
                  failed_at: null,
                  cancelled_at: null,
                  usage: null,
                  step_details: {
                    type: 'message_creation',
                    message_creation: { message_id: message.id },
                  },
                },
              })
            }
          }

          if (item.type === 'function_call' || item.type === 'tool_call' || item.type === 'custom_tool_call') {
            const call_id = item.call_id ?? item.id
            const entry = { call_id, name: item.name, arguments: (item.arguments ?? item.input ?? '') }
            if (item.id) toolCallByItemId.set(item.id, entry)
            if (call_id) toolCallByItemId.set(call_id, entry)
            if (!toolCallsRunStep) {
              toolCallsRunStep = await onEvent({
                event: 'thread.run.step.created',
                data: {
                  id: 'THERE_IS_A_BUG_IN_SUPERCOMPAT_IF_YOU_SEE_THIS_ID',
                  object: 'thread.run.step',
                  run_id: run.id,
                  assistant_id: run.assistant_id,
                  thread_id: run.thread_id,
                  type: 'tool_calls',
                  status: 'in_progress',
                  completed_at: null,
                  created_at: dayjs().unix(),
                  expired_at: null,
                  last_error: null,
                  metadata: {},
                  failed_at: null,
                  cancelled_at: null,
                  usage: null,
                  step_details: { type: 'tool_calls', tool_calls: [] },
                },
              })
            }

            await onEvent({
              event: 'thread.run.step.delta',
              data: {
                object: 'thread.run.step.delta',
                run_id: run.id,
                id: toolCallsRunStep.id,
                delta: {
                  step_details: {
                    type: 'tool_calls',
                    tool_calls: [
                      {
                        id: call_id,
                        type: 'function',
                        function: { name: item.name, arguments: item.arguments ?? '' },
                      },
                    ],
                  },
                },
              },
            } as any)

            // Emit requires_action early to satisfy immediate retrieve and streaming expectations
            const toolCalls = Array.from(toolCallByItemId.values())
            await onEvent({
              event: 'thread.run.requires_action',
              data: {
                ...run,
                status: 'requires_action',
                required_action: {
                  type: 'submit_tool_outputs',
                  submit_tool_outputs: {
                    tool_calls: toolCalls.map((tc) => ({
                      id: tc.call_id,
                      type: 'function',
                      function: { name: tc.name, arguments: tc.arguments },
                    })),
                  },
                },
              },
            })
          }
          break
        }
        case 'response.output_item.done': {
          const item: any = (evt as any).item
          if (item?.type === 'function_call' || item?.type === 'custom_tool_call') {
            const call_id = item.call_id ?? item.id
            const entry = { call_id, name: item.name, arguments: (item.arguments ?? item.input ?? '') }
            if (item.id) toolCallByItemId.set(item.id, entry)
            if (call_id) toolCallByItemId.set(call_id, entry)

            if (!toolCallsRunStep) {
              toolCallsRunStep = await onEvent({
                event: 'thread.run.step.created',
                data: {
                  id: 'THERE_IS_A_BUG_IN_SUPERCOMPAT_IF_YOU_SEE_THIS_ID',
                  object: 'thread.run.step',
                  run_id: run.id,
                  assistant_id: run.assistant_id,
                  thread_id: run.thread_id,
                  type: 'tool_calls',
                  status: 'in_progress',
                  completed_at: null,
                  created_at: dayjs().unix(),
                  expired_at: null,
                  last_error: null,
                  metadata: {},
                  failed_at: null,
                  cancelled_at: null,
                  usage: null,
                  step_details: { type: 'tool_calls', tool_calls: [] },
                },
              })
            }

            const toolCalls = Array.from(toolCallByItemId.values())
            await onEvent({
              event: 'thread.run.step.delta',
              data: {
                object: 'thread.run.step.delta',
                run_id: run.id,
                id: toolCallsRunStep?.id,
                delta: {
                  step_details: {
                    type: 'tool_calls',
                    tool_calls: toolCalls.map((tc) => ({
                      id: tc.call_id,
                      type: 'function',
                      function: { name: tc.name, arguments: tc.arguments },
                    })),
                  },
                },
              },
            } as any)

            return await onEvent({
              event: 'thread.run.requires_action',
              data: {
                ...run,
                status: 'requires_action',
                required_action: {
                  type: 'submit_tool_outputs',
                  submit_tool_outputs: {
                    tool_calls: toolCalls.map((tc) => ({
                      id: tc.call_id,
                      type: 'function',
                      function: { name: tc.name, arguments: tc.arguments },
                    })),
                  },
                },
              },
            })
          }
          break
        }
        case 'response.output_text.delta': {
          const delta = (evt as any).delta
          textBuffer += delta
          if (!message) {
            // Lazily create message if not yet emitted
            message = await onEvent({
              event: 'thread.message.created',
              data: {
                id: 'THERE_IS_A_BUG_IN_SUPERCOMPAT_IF_YOU_SEE_THIS_ID',
                object: 'thread.message',
                completed_at: null,
                run_id: run.id,
                created_at: dayjs().unix(),
                assistant_id: run.assistant_id,
                incomplete_at: null,
                incomplete_details: null,
                metadata: {},
                attachments: [],
                thread_id: run.thread_id,
                content: [{ text: { value: '', annotations: [] }, type: 'text' }],
                role: 'assistant',
                status: 'in_progress',
              },
            })
            await onEvent({
              event: 'thread.run.step.created',
              data: {
                id: 'THERE_IS_A_BUG_IN_SUPERCOMPAT_IF_YOU_SEE_THIS_ID',
                object: 'thread.run.step',
                run_id: run.id,
                assistant_id: run.assistant_id,
                thread_id: run.thread_id,
                type: 'message_creation',
                status: 'completed',
                completed_at: dayjs().unix(),
                created_at: dayjs().unix(),
                expired_at: null,
                last_error: null,
                metadata: {},
                failed_at: null,
                cancelled_at: null,
                usage: null,
                step_details: {
                  type: 'message_creation',
                  message_creation: { message_id: message.id },
                },
              },
            })
          }
          await onEvent({
            event: 'thread.message.delta',
            data: {
              id: message.id,
              delta: {
                content: [
                  { type: 'text', index: 0, text: { value: delta } },
                ],
              },
            },
          } as OpenAI.Beta.AssistantStreamEvent.ThreadMessageDelta)
          break
        }
        case 'response.function_call_arguments.delta':
        case 'response.custom_tool_call_input.delta': {
          const { item_id, delta } = evt as any
          const call = toolCallByItemId.get(item_id)

          // Ensure the tool-calls step exists even if argument deltas arrive first
          if (!toolCallsRunStep) {
            toolCallsRunStep = await onEvent({
              event: 'thread.run.step.created',
              data: {
                id: 'THERE_IS_A_BUG_IN_SUPERCOMPAT_IF_YOU_SEE_THIS_ID',
                object: 'thread.run.step',
                run_id: run.id,
                assistant_id: run.assistant_id,
                thread_id: run.thread_id,
                type: 'tool_calls',
                status: 'in_progress',
                completed_at: null,
                created_at: dayjs().unix(),
                expired_at: null,
                last_error: null,
                metadata: {},
                failed_at: null,
                cancelled_at: null,
                usage: null,
                step_details: { type: 'tool_calls', tool_calls: [] },
              },
            })
          }

          if (call) {
            call.arguments += delta
            await onEvent({
              event: 'thread.run.step.delta',
              data: {
                object: 'thread.run.step.delta',
                run_id: run.id,
                id: toolCallsRunStep?.id,
                delta: {
                  step_details: {
                    type: 'tool_calls',
                    tool_calls: [
                      {
                        id: call.call_id,
                        type: 'function',
                        function: { name: call.name, arguments: delta },
                      },
                    ],
                  },
                },
              },
            } as any)
          }
          break
        }
        case 'response.function_call_arguments.done':
        case 'response.custom_tool_call_input.done': {
          const { item_id } = evt as any
          if (item_id) toolCallDone.add(item_id)
          break
        }
        case 'response.completed': {
          responseId = (evt as any).response?.id ?? responseId
          if (responseId && setLastResponseId) await setLastResponseId(responseId)
          // Fallback: extract final response snapshot text and tool calls
          const resp: any = (evt as any).response
          if (resp?.output?.length) {
            for (const out of resp.output) {
              if (out.type === 'message') {
                const txt = (out.content?.find?.((c: any) => c.type === 'output_text')?.text ?? '') as string
                if (txt && !textBuffer) textBuffer = txt
              } else if (out.type === 'function_call' || out.type === 'tool_call' || out.type === 'custom_tool_call') {
                const call_id = out.call_id ?? out.id
                const call = { call_id, name: out.name, arguments: (out.arguments ?? out.input ?? '') }
                if (out.id) toolCallByItemId.set(out.id, call)
                if (call_id) toolCallByItemId.set(call_id, call)
              }
            }
          }
          // Ensure message exists if we have text
          if (!message && textBuffer) {
            message = await onEvent({
              event: 'thread.message.created',
              data: {
                id: 'THERE_IS_A_BUG_IN_SUPERCOMPAT_IF_YOU_SEE_THIS_ID',
                object: 'thread.message',
                completed_at: null,
                run_id: run.id,
                created_at: dayjs().unix(),
                assistant_id: run.assistant_id,
                incomplete_at: null,
                incomplete_details: null,
                metadata: {},
                attachments: [],
                thread_id: run.thread_id,
                content: [{ text: { value: '', annotations: [] }, type: 'text' }],
                role: 'assistant',
                status: 'in_progress',
              },
            })
          }
          if (message) {
            await onEvent({
              event: 'thread.message.completed',
              data: {
                ...message,
                status: 'completed',
                content: [{ text: { value: textBuffer, annotations: [] }, type: 'text' }],
                tool_calls: undefined,
              },
            })
          }

          // Ensure the assistant message exists in the conversation for immediate reads
          if ((conversationId ?? null) && typeof textBuffer === 'string' && textBuffer.trim().length > 0) {
            // Retry insertion to avoid transient conversation locks
            const maxAttempts = 5
            let attempt = 0
            while (true) {
              try {
                console.log('[responsesRunAdapter] insert assistant -> conversation', { conversationId, textBuffer })
                await client.conversations.items.create(conversationId!, {
                  items: [
                    {
                      type: 'message',
                      role: 'assistant',
                      content: [
                        { type: 'output_text', text: textBuffer },
                      ],
                    } as any,
                  ],
                })
                break
              } catch (err: any) {
                const code = err?.code || err?.error?.code
                const isLocked = code === 'conversation_locked' || /conversation/i.test(err?.error?.param ?? '')
                attempt += 1
                if (!isLocked || attempt >= maxAttempts) throw err
                await new Promise((r) => setTimeout(r, 200 * attempt))
              }
            }
          }

          const toolCalls = Array.from(toolCallByItemId.values())
          if (toolCalls.length) {
            if (!toolCallsRunStep) {
              toolCallsRunStep = await onEvent({
                event: 'thread.run.step.created',
                data: {
                  id: 'THERE_IS_A_BUG_IN_SUPERCOMPAT_IF_YOU_SEE_THIS_ID',
                  object: 'thread.run.step',
                  run_id: run.id,
                  assistant_id: run.assistant_id,
                  thread_id: run.thread_id,
                  type: 'tool_calls',
                  status: 'in_progress',
                  completed_at: null,
                  created_at: dayjs().unix(),
                  expired_at: null,
                  last_error: null,
                  metadata: {},
                  failed_at: null,
                  cancelled_at: null,
                  usage: null,
                  step_details: { type: 'tool_calls', tool_calls: [] },
                },
              })
            }

            await onEvent({
              event: 'thread.run.step.delta',
              data: {
                object: 'thread.run.step.delta',
                run_id: run.id,
                id: toolCallsRunStep?.id,
                delta: {
                  step_details: {
                    type: 'tool_calls',
                    tool_calls: toolCalls.map((tc) => ({
                      id: tc.call_id,
                      type: 'function',
                      function: { name: tc.name, arguments: tc.arguments },
                    })),
                  },
                },
              },
            } as any)

            return await onEvent({
              event: 'thread.run.requires_action',
              data: {
                ...run,
                status: 'requires_action',
                required_action: {
                  type: 'submit_tool_outputs',
                  submit_tool_outputs: {
                    tool_calls: toolCalls.map((tc) => ({
                      id: tc.call_id,
                      type: 'function',
                      function: { name: tc.name, arguments: tc.arguments },
                    })),
                  },
                },
              },
            })
          } else {
            return await onEvent({
              event: 'thread.run.completed',
              data: { ...run, status: 'completed', completed_at: dayjs().unix() },
            })
          }
        }
        case 'response.failed':
        case 'error': {
          return await onEvent({
            event: 'thread.run.failed',
            data: {
              ...run,
              failed_at: dayjs().unix(),
              status: 'failed',
              last_error: { code: 'server_error', message: 'response failed' },
            },
          })
        }
      }
    }
  } catch (e: any) {
    console.error(e)
    return onEvent({
      event: 'thread.run.failed',
      data: {
        ...run,
        failed_at: dayjs().unix(),
        status: 'failed',
        last_error: { code: 'server_error', message: `${e?.message ?? ''} ${e?.cause?.message ?? ''}` },
      },
    })
  }
}
