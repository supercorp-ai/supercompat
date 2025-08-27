import { uid, isEmpty } from 'radash'
import dayjs from 'dayjs'
import OpenAI from 'openai'
import { AssistantStream } from 'openai/lib/AssistantStream'
import { MessageWithRun, ThreadWithConversationId } from '@/types'
import { messages } from './messages'
import { supercompat } from '@/supercompat'

interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
  index: number
}

interface MessageWithToolCalls extends OpenAI.Beta.Threads.Message {
  tool_calls?: ToolCall[]
}

export const responsesRunAdapter =
  () =>
  async ({
    client: clientAdapter,
    run,
    onEvent,
    getMessages,
    getThread,
  }: {
    client: OpenAI
    run: OpenAI.Beta.Threads.Run
    onEvent: (event: OpenAI.Beta.AssistantStreamEvent) => Promise<unknown>
    getMessages: () => Promise<MessageWithRun[]>
    getThread: () => Promise<ThreadWithConversationId | null>
  }) => {
    if (run.status !== 'queued') return

    const client = supercompat({
      client: clientAdapter,
    })

    onEvent({
      event: 'thread.run.in_progress',
      data: {
        ...run,
        status: 'in_progress',
      },
    })

    const thread = await getThread()
    const openaiConversationId = thread?.openaiConversationId ?? undefined

    const input = await messages({
      run,
      getMessages,
    })

    const mappedTools = (run.tools || []).map((t) =>
      t.type === 'function'
        ? {
            type: 'function',
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters,
          }
        : t,
    )

    const opts: Record<string, unknown> = {
      model: run.model,
      input,
      ...(run.instructions ? { instructions: run.instructions } : {}),
      ...(isEmpty(mappedTools) ? {} : { tools: mappedTools }),
      ...(typeof run.response_format === 'object' &&
      (run.response_format as any).type &&
      (run.response_format as any).type !== 'text'
        ? { response_format: run.response_format }
        : {}),
    }

    let providerResponse: AssistantStream

    try {
      providerResponse = await (client as any).responses.create({
        ...opts,
        ...(openaiConversationId ? { conversation: openaiConversationId } : {}),
        stream: true,
      })
    } catch (e: any) {
      const msg = `${e?.message ?? ''} ${e?.cause?.message ?? ''}`.trim()
      console.error(e)
      return onEvent({
        event: 'thread.run.failed',
        data: {
          ...run,
          failed_at: dayjs().unix(),
          status: 'in_progress',
          last_error: {
            code: 'server_error',
            message: msg,
          },
        },
      })
    }

    const messageId = uid(24)
    let message = (await onEvent({
      event: 'thread.message.created',
      data: {
        id: messageId,
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
    })) as MessageWithToolCalls

    const messageRunStepId = uid(24)
    onEvent({
      event: 'thread.run.step.created',
      data: {
        id: messageRunStepId,
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

    let toolCallsRunStep: OpenAI.Beta.Threads.Runs.RunStep | undefined
    let currentContent = ''
    let currentToolCalls: ToolCall[] = []
    const toolCallsByItemId: Record<string, ToolCall> = {}
    let newConversationId: string | undefined

    for await (const event of providerResponse as any) {
      switch (event.type) {
        case 'response.created': {
          const convId =
            event.response?.conversation_id ?? event.response?.conversation?.id
          if (convId) {
            newConversationId = convId
          }
          break
        }
        case 'response.output_text.delta': {
          currentContent = `${currentContent}${event.delta}`
          onEvent({
            event: 'thread.message.delta',
            data: {
              id: message.id,
              delta: {
                content: [
                  {
                    type: 'text',
                    index: 0,
                    text: {
                      value: event.delta,
                    },
                  },
                ],
              },
            },
          } as OpenAI.Beta.AssistantStreamEvent.ThreadMessageDelta)
          break
        }
        case 'response.output_item.added': {
          if (event.item.type === 'function_call') {
            if (!toolCallsRunStep) {
              const toolRunStepId = uid(24)
              toolCallsRunStep = (await onEvent({
                event: 'thread.run.step.created',
                data: {
                  id: toolRunStepId,
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
              })) as OpenAI.Beta.Threads.Runs.RunStep
            }

            const callId =
              (event.item.call_id ?? event.item.id ?? uid(24)) as string
            const newToolCall: ToolCall = {
              id: callId,
              type: 'function',
              function: {
                name: event.item.name,
                arguments: '',
              },
              index: currentToolCalls.length,
            }
            currentToolCalls.push(newToolCall)
            toolCallsByItemId[event.item.id ?? callId] = newToolCall

            onEvent({
              event: 'thread.run.step.delta',
              data: {
                object: 'thread.run.step.delta',
                run_id: run.id,
                id: toolCallsRunStep!.id,
                delta: {
                  step_details: {
                    type: 'tool_calls',
                    tool_calls: [newToolCall],
                  },
                },
              },
            } as unknown as OpenAI.Beta.AssistantStreamEvent.ThreadRunStepDelta)
          }
          break
        }
        case 'response.function_call_arguments.delta': {
          const tc =
            toolCallsByItemId[event.item_id] ||
            currentToolCalls.find((t) => t.id === event.item_id)
          if (tc) {
            tc.function.arguments = `${tc.function.arguments}${event.delta}`
            onEvent({
              event: 'thread.run.step.delta',
              data: {
                object: 'thread.run.step.delta',
                  run_id: run.id,
                  id: toolCallsRunStep!.id,
                delta: {
                  step_details: {
                    type: 'tool_calls',
                    tool_calls: [
                      {
                        id: tc.id,
                        type: 'function',
                        function: {
                          name: tc.function.name,
                          arguments: tc.function.arguments,
                        },
                        index: currentToolCalls.findIndex(
                          (t) => t.id === tc.id,
                        ),
                      },
                    ],
                  },
                },
              },
            } as unknown as OpenAI.Beta.AssistantStreamEvent.ThreadRunStepDelta)
          }
          break
        }
        case 'response.error': {
          await onEvent({
            event: 'thread.run.failed',
            data: {
              ...run,
              ...(newConversationId
                ? {
                    metadata: {
                      ...(run.metadata ?? {}),
                      openaiConversationId: newConversationId,
                    },
                  }
                : {}),
              failed_at: dayjs().unix(),
              status: 'in_progress',
              last_error: {
                code: 'server_error',
                message: event.error?.message ?? 'unknown_error',
              },
            },
          })
          return
        }
        default:
          break
      }
    }

    // finalize the streamed response if supported and no tool calls were emitted
    if (
      isEmpty(currentToolCalls) &&
      typeof (providerResponse as any).final === 'function'
    ) {
      await (providerResponse as any).final()
    }

    message = (await onEvent({
      event: 'thread.message.completed',
      data: {
        ...message,
        status: 'completed',
        content: [
          { text: { value: currentContent, annotations: [] }, type: 'text' },
        ],
        tool_calls: currentToolCalls,
      } as MessageWithToolCalls,
    })) as MessageWithToolCalls

    if (isEmpty(message.tool_calls)) {
      return onEvent({
        event: 'thread.run.completed',
        data: {
          ...run,
          status: 'completed',
          completed_at: dayjs().unix(),
          ...(newConversationId
            ? {
                metadata: {
                  ...(run.metadata ?? {}),
                  openaiConversationId: newConversationId,
                },
              }
            : {}),
        },
      })
    }

    const threadForEvent = await getThread()

    return onEvent({
      event: 'thread.run.requires_action',
      data: {
        ...run,
        id: run.id,
        thread_id: threadForEvent?.openaiConversationId || threadForEvent?.id || run.thread_id,
        status: 'requires_action',
        ...(newConversationId
          ? {
              metadata: {
                ...(run.metadata ?? {}),
                openaiConversationId: newConversationId,
              },
            }
          : {}),
        required_action: {
          type: 'submit_tool_outputs',
          submit_tool_outputs: {
            tool_calls: message.tool_calls ?? [],
          },
        },
      },
    })
  }
