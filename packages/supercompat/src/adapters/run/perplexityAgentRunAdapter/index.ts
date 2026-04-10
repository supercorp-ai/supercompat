/**
 * Run adapter for Perplexity's Agent API (/v1/agent).
 *
 * Uses the Responses API-compatible Agent endpoint for LLM calls with
 * function calling support. Works with prismaStorageAdapter for state management.
 *
 * Message format translation:
 *   Chat Completions messages → Agent API input items
 *   Agent API output items → Assistants API stream events
 */
import { uid, isEmpty } from 'radash'
import dayjs from 'dayjs'
import type OpenAI from 'openai'
import { MessageWithRun, RunAdapterBody } from '@/types'
import { messages as getCompletionsMessages } from '../completionsRunAdapter/messages'

const serializeTool = (tool: any) => {
  if (tool.type === 'function' && tool.function) {
    return {
      type: 'function',
      name: tool.function.name,
      ...(tool.function.description ? { description: tool.function.description } : {}),
      ...(tool.function.parameters ? { parameters: tool.function.parameters } : {}),
    }
  }
  return tool
}

/**
 * Convert Chat Completions messages to Agent API input items.
 */
const serializeInput = (
  messages: OpenAI.ChatCompletionMessageParam[],
): { instructions?: string; input: any[] } => {
  let instructions: string | undefined
  const input: any[] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      // System messages become instructions
      instructions = typeof msg.content === 'string'
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content.map((p: any) => typeof p === 'string' ? p : p.text || '').join('\n')
          : ''
      continue
    }

    if (msg.role === 'user') {
      input.push({
        type: 'message',
        role: 'user',
        content: typeof msg.content === 'string'
          ? msg.content
          : msg.content,
      })
      continue
    }

    if (msg.role === 'assistant') {
      const assistantMsg = msg as OpenAI.ChatCompletionAssistantMessageParam
      if (assistantMsg.content) {
        input.push({
          type: 'message',
          role: 'assistant',
          content: typeof assistantMsg.content === 'string'
            ? assistantMsg.content
            : assistantMsg.content,
        })
      }
      // Tool calls become function_call input items
      if (assistantMsg.tool_calls) {
        for (const tc of assistantMsg.tool_calls) {
          if (tc.type === 'function') {
            input.push({
              type: 'function_call',
              call_id: tc.id,
              name: tc.function.name,
              arguments: tc.function.arguments,
            })
          }
        }
      }
      continue
    }

    if (msg.role === 'tool') {
      const toolMsg = msg as OpenAI.ChatCompletionToolMessageParam
      input.push({
        type: 'function_call_output',
        call_id: toolMsg.tool_call_id,
        output: typeof toolMsg.content === 'string'
          ? toolMsg.content
          : JSON.stringify(toolMsg.content),
      })
      continue
    }
  }

  return { instructions, input }
}

export const perplexityAgentRunAdapter = ({
  apiKey,
  baseURL = 'https://api.perplexity.ai',
  preset = 'pro-search',
}: {
  apiKey: string
  baseURL?: string
  preset?: string
}) => {
  return {
    handleRun: async ({
      body: run,
      onEvent,
      getMessages,
    }: {
      client: OpenAI
      body: RunAdapterBody
      onEvent: (event: OpenAI.Beta.AssistantStreamEvent) => Promise<any>
      getMessages: () => Promise<MessageWithRun[]>
    }) => {
      if (run.status !== 'queued') return

      await onEvent({
        event: 'thread.run.created',
        data: {
          ...run,
          status: 'queued',
        },
      })

      await onEvent({
        event: 'thread.run.in_progress',
        data: {
          ...run,
          status: 'in_progress',
        },
      })

      // Build messages using the same serializer as completionsRunAdapter
      const completionsMessages = await getCompletionsMessages({
        run,
        getMessages,
      })

      // Transform to Agent API format
      const { instructions, input } = serializeInput(completionsMessages as OpenAI.ChatCompletionMessageParam[])
      const tools = isEmpty(run.tools)
        ? undefined
        : run.tools.map(serializeTool)

      const agentBody: any = {
        preset,
        input,
        stream: true,
        ...(instructions ? { instructions } : {}),
        ...(tools ? { tools } : {}),
      }

      let response: Response

      try {
        response = await fetch(`${baseURL}/v1/agent`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(agentBody),
        })
      } catch (e: any) {
        return onEvent({
          event: 'thread.run.failed',
          data: {
            ...run,
            failed_at: dayjs().unix(),
            status: 'failed',
            last_error: {
              code: 'server_error',
              message: e?.message ?? 'Network error',
            },
          },
        })
      }

      if (!response.ok) {
        const errorBody = await response.text()
        return onEvent({
          event: 'thread.run.failed',
          data: {
            ...run,
            failed_at: dayjs().unix(),
            status: 'failed',
            last_error: {
              code: 'server_error',
              message: `${response.status}: ${errorBody}`,
            },
          },
        })
      }

      // Create initial message
      let message = await onEvent({
        event: 'thread.message.created',
        data: {
          id: `msg_${uid(24)}`,
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
          id: `step_${uid(24)}`,
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
            message_creation: {
              message_id: message.id,
            },
          },
        },
      })

      // Parse SSE stream
      let currentContent = ''
      const functionCalls: Array<{ id: string; call_id: string; name: string; arguments: string }> = []
      let toolCallsRunStep: any

      if (!response.body) {
        return onEvent({
          event: 'thread.run.failed',
          data: { ...run, failed_at: dayjs().unix(), status: 'failed', last_error: { code: 'server_error', message: 'Empty response body' } },
        })
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue

          let event: any
          try {
            event = JSON.parse(data)
          } catch {
            continue
          }

          // Handle text deltas
          if (event.type === 'response.output_text.delta') {
            const delta = event.delta || ''
            currentContent += delta

            await onEvent({
              event: 'thread.message.delta',
              data: {
                id: message.id,
                delta: {
                  content: [{
                    type: 'text',
                    index: 0,
                    text: { value: delta },
                  }],
                },
              },
            } as OpenAI.Beta.AssistantStreamEvent.ThreadMessageDelta)
          }

          // Handle function calls in output
          if (event.type === 'response.function_call_arguments.delta') {
            // Find or create the function call being built
            let fc = functionCalls.find(f => f.call_id === event.item_id)
            if (fc) {
              fc.arguments += event.delta || ''
            }
          }

          if (event.type === 'response.output_item.added') {
            const item = event.item
            if (item?.type === 'function_call') {
              functionCalls.push({
                id: item.id || `call_${uid(12)}`,
                call_id: item.call_id || item.id || `call_${uid(12)}`,
                name: item.name || '',
                arguments: item.arguments || '',
              })

              if (!toolCallsRunStep) {
                toolCallsRunStep = await onEvent({
                  event: 'thread.run.step.created',
                  data: {
                    id: `step_${uid(24)}`,
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
                    step_details: {
                      type: 'tool_calls',
                      tool_calls: [],
                    },
                  },
                })
              }
            }
          }

          // Handle completed response
          if (event.type === 'response.completed') {
            const resp = event.response
            if (resp?.output) {
              for (const item of resp.output) {
                if (item.type === 'function_call') {
                  // Update function call with final data
                  let fc = functionCalls.find(f => f.call_id === item.call_id)
                  if (fc) {
                    fc.name = item.name || fc.name
                    fc.arguments = item.arguments || fc.arguments
                  } else {
                    functionCalls.push({
                      id: item.id || `call_${uid(12)}`,
                      call_id: item.call_id || item.id,
                      name: item.name || '',
                      arguments: item.arguments || '',
                    })
                  }
                }
              }
            }
          }
        }
      }

      // Build tool calls in OpenAI format
      const currentToolCalls = functionCalls.map(fc => ({
        id: fc.call_id,
        type: 'function' as const,
        function: {
          name: fc.name,
          arguments: fc.arguments,
        },
      }))

      // Complete the message
      message = await onEvent({
        event: 'thread.message.completed',
        data: {
          ...message,
          status: 'completed',
          content: [{ text: { value: currentContent, annotations: [] }, type: 'text' }],
          tool_calls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
        },
      })

      // If there are function calls, emit requires_action
      if (currentToolCalls.length > 0) {
        return onEvent({
          event: 'thread.run.requires_action',
          data: {
            ...run,
            status: 'requires_action',
            required_action: {
              type: 'submit_tool_outputs',
              submit_tool_outputs: {
                tool_calls: currentToolCalls.map(tc => ({
                  id: tc.id,
                  type: 'function',
                  function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                  },
                })),
              },
            },
          },
        })
      }

      // No tool calls — run completed
      if (toolCallsRunStep) {
        await onEvent({
          event: 'thread.run.step.completed',
          data: {
            ...toolCallsRunStep,
            status: 'completed',
            completed_at: dayjs().unix(),
            step_details: {
              type: 'tool_calls',
              tool_calls: currentToolCalls,
            },
          },
        })
      }

      return onEvent({
        event: 'thread.run.completed',
        data: {
          ...run,
          status: 'completed',
          completed_at: dayjs().unix(),
        },
      })
    },
  }
}
