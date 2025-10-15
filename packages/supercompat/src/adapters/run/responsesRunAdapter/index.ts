import dayjs from 'dayjs'
import { uid } from 'radash'
import type OpenAI from 'openai'
import { serializeResponseAsRun } from '@/lib/responses/serializeResponseAsRun'
import { serializeItemAsMessage } from '@/lib/items/serializeItemAsMessage'
import { serializeItemAsMessageCreationRunStep } from '@/lib/items/serializeItemAsMessageCreationRunStep'
import { saveResponseItemsToConversationMetadata } from '@/lib/responses/saveResponseItemsToConversationMetadata'
import { serializeItemAsImageGenerationRunStep } from '@/lib/items/serializeItemAsImageGenerationRunStep'
import { serializeItemAsWebSearchRunStep } from '@/lib/items/serializeItemAsWebSearchRunStep'
import { serializeItemAsMcpListToolsRunStep } from '@/lib/items/serializeItemAsMcpListToolsRunStep'
import { serializeItemAsMcpCallRunStep } from '@/lib/items/serializeItemAsMcpCallRunStep'
import { serializeItemAsCodeInterpreterCallRunStep } from '@/lib/items/serializeItemAsCodeInterpreterCallRunStep'
import { serializeItemAsComputerCallRunStep } from '@/lib/items/serializeItemAsComputerCallRunStep'
import { serializeItemAsReasoningRunStep } from '@/lib/items/serializeItemAsReasoningRunStep'

type Args = {
  select?: {
    id?: boolean;
  };
}

type NormalizedArgs = {
  select: {
    id: boolean;
  };
};

const serializeToolCalls = ({
  toolCalls,
}: {
  toolCalls: Array<OpenAI.Responses.ResponseFunctionToolCall | OpenAI.Responses.ResponseComputerToolCall>
}) => (
  toolCalls.map((toolCall) => {
    if (toolCall.type === 'function_call') {
      return {
        id: toolCall.call_id,
        type: 'function' as const,
        function: {
          name: toolCall.name,
          arguments: toolCall.arguments,
        },
      }
    } else if (toolCall.type === 'computer_call') {
      return {
        id: toolCall.call_id,
        type: 'computer_call' as const,
        computer_call: {
          action: toolCall.action,
          pending_safety_checks: toolCall.pending_safety_checks,
        },
      }
    }
  }) as OpenAI.Beta.Threads.Runs.RequiredActionFunctionToolCall[]
)

export const responsesRunAdapter =
  ({
    getOpenaiAssistant: getDirectOpenaiAssistant,
    waitUntil = <T>(p: Promise<T>) => p.then(() => {})
  }: {
    getOpenaiAssistant: (args?: Args) => Promise<OpenAI.Beta.Assistants.Assistant> | OpenAI.Beta.Assistants.Assistant | Pick<OpenAI.Beta.Assistants.Assistant, 'id'> | Promise<Pick<OpenAI.Beta.Assistants.Assistant, 'id'>>
    waitUntil?: <T>(p: Promise<T>) => void | Promise<void>
  }) => {
    let cachedOpenaiAssistant: OpenAI.Beta.Assistants.Assistant | null = null

    const getOpenaiAssistant = async ({ select: { id = false } = {} }: Args = {}) => {
      const args: NormalizedArgs = { select: { id } }

      if (args.select.id) {
        return {
          id: (await getDirectOpenaiAssistant({ select: { id: true } })).id,
        }
      }

      if (cachedOpenaiAssistant) return cachedOpenaiAssistant

      cachedOpenaiAssistant = await getDirectOpenaiAssistant() as OpenAI.Beta.Assistants.Assistant
      return cachedOpenaiAssistant
    }

    const handleRun = async ({
      client,
      threadId,
      response,
      onEvent,
    }: {
      client: OpenAI
      threadId: string
      response: AsyncIterable<any>
      onEvent: (event: OpenAI.Beta.AssistantStreamEvent) => Promise<any>
    }) => {
      let responseCreatedResponse: OpenAI.Responses.Response | null = null
      let responseCompletedResponse: OpenAI.Responses.Response | null = null
      const toolCalls: Record<string, OpenAI.Responses.ResponseFunctionToolCall> = {}
      const mcpCalls: Record<string, OpenAI.Responses.ResponseItem.McpCall> = {}
      const codeInterpreterCalls: Record<string, OpenAI.Responses.ResponseCodeInterpreterToolCall> = {}

      let itemIds: string[] = []

      try {
        for await (const event of response as AsyncIterable<OpenAI.Responses.ResponseStreamEvent>) {
          switch (event.type) {
            case 'response.created':
              responseCreatedResponse = event.response

              await onEvent({
                event: 'thread.run.created',
                data: serializeResponseAsRun({
                  response: event.response,
                  assistantId: (await getOpenaiAssistant({ select: { id: true } })).id,
                }),
              })
              break

            case 'response.in_progress':
              await onEvent({
                event: 'thread.run.in_progress',
                data: serializeResponseAsRun({
                  response: event.response,
                  assistantId: (await getOpenaiAssistant({ select: { id: true } })).id,
                }),
              })
              break

            case 'response.completed': {
              responseCompletedResponse = event.response
              itemIds = event.response.output.filter((o) => o.id).map((o) => o.id!)
              break
            }

            case 'response.failed': {
              await onEvent({
                event: 'thread.run.failed',
                data: serializeResponseAsRun({
                  response: event.response,
                  assistantId: (await getOpenaiAssistant({ select: { id: true } })).id,
                }),
              })
              break
            }

            case 'response.output_text.delta': {
              await onEvent({
                event: 'thread.message.delta',
                data: {
                  id: event.item_id,
                  delta: {
                    content: [{ type: 'text', index: event.content_index, text: { value: event.delta } }],
                  },
                },
              } as OpenAI.Beta.AssistantStreamEvent.ThreadMessageDelta)

              break
            }

            // case 'response.output_text.done': {
            //   break
            // }
            //
            case 'response.output_item.added': {
              if (event.item.type === 'message') {
                await onEvent({
                  event: 'thread.message.created',
                  data: serializeItemAsMessage({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    createdAt: dayjs().unix(),
                    runId: responseCreatedResponse!.id,
                    status: 'in_progress',
                  })
                })

                await onEvent({
                  event: 'thread.run.step.created',
                  data: serializeItemAsMessageCreationRunStep({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    runId: responseCreatedResponse!.id,
                    status: 'in_progress',
                    completedAt: null,
                  })
                })
              } else if (event.item.type === 'function_call') {
                toolCalls[event.item.id!] = event.item

                await onEvent({
                  event: 'thread.run.step.created',
                  data: serializeItemAsMessageCreationRunStep({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    runId: responseCreatedResponse!.id,
                  })
                })
              } else if (event.item.type === 'computer_call') {
                await onEvent({
                  event: 'thread.message.created',
                  data: serializeItemAsMessage({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    createdAt: dayjs().unix(),
                    runId: responseCreatedResponse!.id,
                    status: 'in_progress',
                  })
                })

                await onEvent({
                  event: 'thread.run.step.created',
                  data: serializeItemAsMessageCreationRunStep({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    runId: responseCreatedResponse!.id,
                  })
                })

                await onEvent({
                  event: 'thread.run.step.created',
                  data: serializeItemAsComputerCallRunStep({
                    item: event.item,
                    items: [],
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    threadId,
                    runId: responseCreatedResponse!.id,
                    completedAt: null,
                  })
                })
              } else if (event.item.type === 'image_generation_call') {
                await onEvent({
                  event: 'thread.message.created',
                  data: serializeItemAsMessage({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    createdAt: dayjs().unix(),
                    runId: responseCreatedResponse!.id,
                    status: 'in_progress',
                  })
                })

                await onEvent({
                  event: 'thread.run.step.created',
                  data: serializeItemAsMessageCreationRunStep({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    runId: responseCreatedResponse!.id,
                    status: 'in_progress',
                    completedAt: null,
                  })
                })

                await onEvent({
                  event: 'thread.run.step.created',
                  data: serializeItemAsImageGenerationRunStep({
                    item: event.item,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    threadId,
                    runId: responseCreatedResponse!.id,
                    status: 'in_progress',
                    completedAt: null,
                  })
                })
              } else if (event.item.type === 'reasoning') {
                await onEvent({
                  event: 'thread.message.created',
                  data: serializeItemAsMessage({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    createdAt: dayjs().unix(),
                    runId: responseCreatedResponse!.id,
                    status: 'in_progress',
                  })
                })

                await onEvent({
                  event: 'thread.run.step.created',
                  data: serializeItemAsMessageCreationRunStep({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    runId: responseCreatedResponse!.id,
                    status: 'in_progress',
                    completedAt: null,
                  })
                })

                await onEvent({
                  event: 'thread.run.step.created',
                  data: serializeItemAsReasoningRunStep({
                    item: event.item,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    threadId,
                    runId: responseCreatedResponse!.id,
                    completedAt: null,
                  })
                })
              } else if (event.item.type === 'web_search_call') {
                await onEvent({
                  event: 'thread.message.created',
                  data: serializeItemAsMessage({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    createdAt: dayjs().unix(),
                    runId: responseCreatedResponse!.id,
                    status: 'in_progress',
                  })
                })

                await onEvent({
                  event: 'thread.run.step.created',
                  data: serializeItemAsMessageCreationRunStep({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    runId: responseCreatedResponse!.id,
                    status: 'in_progress',
                    completedAt: null,
                  })
                })

                await onEvent({
                  event: 'thread.run.step.created',
                  data: serializeItemAsWebSearchRunStep({
                    item: event.item,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    threadId,
                    runId: responseCreatedResponse!.id,
                    completedAt: null,
                  })
                })
              } else if (event.item.type === 'mcp_list_tools') {
                await onEvent({
                  event: 'thread.message.created',
                  data: serializeItemAsMessage({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    createdAt: dayjs().unix(),
                    runId: responseCreatedResponse!.id,
                    status: 'in_progress',
                  })
                })

                await onEvent({
                  event: 'thread.run.step.created',
                  data: serializeItemAsMessageCreationRunStep({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    runId: responseCreatedResponse!.id,
                    status: 'in_progress',
                    completedAt: null,
                  })
                })

                await onEvent({
                  event: 'thread.run.step.created',
                  data: serializeItemAsMcpListToolsRunStep({
                    item: event.item,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    threadId,
                    runId: responseCreatedResponse!.id,
                    completedAt: null,
                  })
                })
              } else if (event.item.type === 'mcp_call') {
                mcpCalls[event.item.id!] = event.item

                await onEvent({
                  event: 'thread.message.created',
                  data: serializeItemAsMessage({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    createdAt: dayjs().unix(),
                    runId: responseCreatedResponse!.id,
                    status: 'in_progress',
                  })
                })

                await onEvent({
                  event: 'thread.run.step.created',
                  data: serializeItemAsMessageCreationRunStep({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    runId: responseCreatedResponse!.id,
                    status: 'in_progress',
                    completedAt: null,
                  })
                })

                await onEvent({
                  event: 'thread.run.step.created',
                  data: serializeItemAsMcpCallRunStep({
                    item: event.item,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    threadId,
                    runId: responseCreatedResponse!.id,
                    completedAt: null,
                  })
                })
              } else if (event.item.type === 'code_interpreter_call') {
                codeInterpreterCalls[event.item.id!] = event.item

                await onEvent({
                  event: 'thread.message.created',
                  data: serializeItemAsMessage({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    createdAt: dayjs().unix(),
                    runId: responseCreatedResponse!.id,
                    status: 'in_progress',
                  })
                })

                await onEvent({
                  event: 'thread.run.step.created',
                  data: serializeItemAsMessageCreationRunStep({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    runId: responseCreatedResponse!.id,
                    status: 'in_progress',
                    completedAt: null,
                  })
                })

                await onEvent({
                  event: 'thread.run.step.created',
                  data: serializeItemAsCodeInterpreterCallRunStep({
                    item: event.item,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    threadId,
                    runId: responseCreatedResponse!.id,
                    completedAt: null,
                  })
                })
              }

              if (event.item.id) itemIds.push(event.item.id)

              break
            }

            case 'response.output_item.done': {
              if (event.item.type === 'message') {
                await onEvent({
                  event: 'thread.run.step.completed',
                  data: serializeItemAsMessageCreationRunStep({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    runId: responseCreatedResponse!.id,
                  })
                })

                await onEvent({
                  event: 'thread.message.completed',
                  data: serializeItemAsMessage({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    createdAt: dayjs().unix(),
                    runId: responseCreatedResponse!.id,
                  })
                })
              } else if (event.item.type === 'function_call') {
                toolCalls[event.item.id!] = event.item

                await onEvent({
                  event: 'thread.run.step.in_progress',
                  data: serializeItemAsMessageCreationRunStep({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    runId: responseCreatedResponse!.id,
                  })
                })
              } else if (event.item.type === 'image_generation_call') {
                await onEvent({
                  event: 'thread.run.step.completed',
                  data: serializeItemAsImageGenerationRunStep({
                    item: event.item,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    threadId,
                    runId: responseCreatedResponse!.id,
                  })
                })

                await onEvent({
                  event: 'thread.run.step.completed',
                  data: serializeItemAsMessageCreationRunStep({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    runId: responseCreatedResponse!.id,
                  })
                })

                await onEvent({
                  event: 'thread.message.completed',
                  data: serializeItemAsMessage({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    createdAt: dayjs().unix(),
                    runId: responseCreatedResponse!.id,
                  })
                })
              } else if (event.item.type === 'reasoning') {
                await onEvent({
                  event: 'thread.run.step.completed',
                  data: serializeItemAsReasoningRunStep({
                    item: event.item,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    threadId,
                    runId: responseCreatedResponse!.id,
                  })
                })

                await onEvent({
                  event: 'thread.run.step.completed',
                  data: serializeItemAsMessageCreationRunStep({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    runId: responseCreatedResponse!.id,
                  })
                })

                await onEvent({
                  event: 'thread.message.completed',
                  data: serializeItemAsMessage({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    createdAt: dayjs().unix(),
                    runId: responseCreatedResponse!.id,
                  })
                })
              } else if (event.item.type === 'web_search_call') {
                await onEvent({
                  event: 'thread.run.step.completed',
                  data: serializeItemAsWebSearchRunStep({
                    item: event.item,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    threadId,
                    runId: responseCreatedResponse!.id,
                  })
                })

                await onEvent({
                  event: 'thread.run.step.completed',
                  data: serializeItemAsMessageCreationRunStep({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    runId: responseCreatedResponse!.id,
                  })
                })

                await onEvent({
                  event: 'thread.message.completed',
                  data: serializeItemAsMessage({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    createdAt: dayjs().unix(),
                    runId: responseCreatedResponse!.id,
                  })
                })
              } else if (event.item.type === 'mcp_list_tools') {
                await onEvent({
                  event: 'thread.run.step.completed',
                  data: serializeItemAsMcpListToolsRunStep({
                    item: event.item,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    threadId,
                    runId: responseCreatedResponse!.id,
                  })
                })

                await onEvent({
                  event: 'thread.run.step.completed',
                  data: serializeItemAsMessageCreationRunStep({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    runId: responseCreatedResponse!.id,
                  })
                })

                await onEvent({
                  event: 'thread.message.completed',
                  data: serializeItemAsMessage({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    createdAt: dayjs().unix(),
                    runId: responseCreatedResponse!.id,
                  })
                })
              } else if (event.item.type === 'mcp_call') {
                await onEvent({
                  event: 'thread.run.step.completed',
                  data: serializeItemAsMcpCallRunStep({
                    item: event.item,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    threadId,
                    runId: responseCreatedResponse!.id,
                  })
                })

                await onEvent({
                  event: 'thread.run.step.completed',
                  data: serializeItemAsMessageCreationRunStep({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    runId: responseCreatedResponse!.id,
                  })
                })

                await onEvent({
                  event: 'thread.message.completed',
                  data: serializeItemAsMessage({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    createdAt: dayjs().unix(),
                    runId: responseCreatedResponse!.id,
                  })
                })
              } else if (event.item.type === 'code_interpreter_call') {
                await onEvent({
                  event: 'thread.run.step.completed',
                  data: serializeItemAsCodeInterpreterCallRunStep({
                    item: event.item,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    threadId,
                    runId: responseCreatedResponse!.id,
                  })
                })

                await onEvent({
                  event: 'thread.run.step.completed',
                  data: serializeItemAsMessageCreationRunStep({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    runId: responseCreatedResponse!.id,
                  })
                })

                await onEvent({
                  event: 'thread.message.completed',
                  data: serializeItemAsMessage({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant({ select: { id: true } }),
                    createdAt: dayjs().unix(),
                    runId: responseCreatedResponse!.id,
                  })
                })
              }

              break
            }

            case 'response.function_call_arguments.delta': {
              const toolCall = toolCalls[event.item_id]
              if (!toolCall) break

              await onEvent({
                event: 'thread.run.step.delta',
                data: {
                  id: event.item_id,
                  object: 'thread.run.step.delta',
                  delta: {
                    step_details: {
                      type: 'tool_calls',
                      tool_calls: [
                        {
                          id: toolCall.call_id,
                          type: 'function',
                          index: event.output_index,
                          function: {
                            name: toolCall.name,
                            arguments: event.delta,
                            output: null,
                          },
                        },
                      ],
                    },
                  },
                }
              })

              break
            }

            case 'response.mcp_call_arguments.delta': {
              const mcpCall = mcpCalls[event.item_id]
              if (!mcpCall) break

              await onEvent({
                event: 'thread.run.step.delta',
                data: {
                  id: `fc${event.item_id}`,
                  object: 'thread.run.step.delta',
                  delta: {
                    step_details: {
                      type: 'tool_calls',
                      tool_calls: [
                        {
                          id: `ftc${mcpCall.id}`,
                          type: 'function',
                          index: event.output_index,
                          function: {
                            name: mcpCall.name,
                            arguments: event.delta,
                            output: null,
                          },
                        },
                      ],
                    },
                  },
                }
              })

              break
            }

            case 'response.image_generation_call.in_progress':
            case 'response.image_generation_call.generating':
              await onEvent({
                event: 'thread.message.in_progress',
                data: {
                  id: event.item_id,
                  object: 'thread.message' as 'thread.message',
                  created_at: dayjs().unix(),
                  thread_id: threadId,
                  completed_at: null,
                  incomplete_at: null,
                  incomplete_details: null,
                  role: 'assistant' as 'assistant',
                  content: [],
                  assistant_id: (await getOpenaiAssistant({ select: { id: true } })).id,
                  run_id: responseCreatedResponse!.id,
                  attachments: [],
                  status: 'in_progress' as 'in_progress',
                  metadata: {
                    event: JSON.stringify(event),
                  },
                },
              })

              break

            case 'response.image_generation_call.partial_image': {
              await onEvent({
                event: 'thread.message.in_progress',
                data: {
                  id: event.item_id,
                  object: 'thread.message' as 'thread.message',
                  created_at: dayjs().unix(),
                  thread_id: threadId,
                  completed_at: null,
                  incomplete_at: null,
                  incomplete_details: null,
                  role: 'assistant' as 'assistant',
                  content: [{
                    type: 'image_url' as 'image_url',
                    image_url: {
                      url: `data:image/png;base64,${event.partial_image_b64}`,
                      // url: `data:image/png;base64,truncated`,
                      detail: 'auto' as 'auto',
                    },
                  }],
                  assistant_id: (await getOpenaiAssistant({ select: { id: true } })).id,
                  run_id: responseCreatedResponse!.id,
                  attachments: [],
                  status: 'in_progress' as 'in_progress',
                  metadata: {
                    event: JSON.stringify({
                      ...event,
                      partial_image_b64: 'truncated',
                    }),
                  },
                },
              })

              break
            }

            //
            // case 'response.function_call_arguments.done': {
            //   break
            // }

            default:
              break
          }
        }
        if (responseCompletedResponse) {
          const toolCalls = (responseCompletedResponse.output ?? []).filter(
            (o): o is OpenAI.Responses.ResponseFunctionToolCall | OpenAI.Responses.ResponseComputerToolCall =>
              o.type === 'function_call' || o.type === 'computer_call',
          )

          const serializedRun = serializeResponseAsRun({
            response: responseCompletedResponse,
            assistantId: (await getOpenaiAssistant({ select: { id: true } })).id,
          })

          if (toolCalls.length > 0) {
            await onEvent({
              event: 'thread.run.requires_action',
              data: {
                ...serializedRun,
                status: 'requires_action',
                required_action: {
                  type: 'submit_tool_outputs',
                  submit_tool_outputs: {
                    tool_calls: serializeToolCalls({ toolCalls }),
                  },
                },
              },
            })
          } else {
            await onEvent({
              event: 'thread.run.completed',
              data: serializedRun,
            })
          }
        }
      } catch (e: any) {
        await onEvent({
          event: 'thread.run.failed',
          data: {
            id: responseCreatedResponse?.id || `run_${uid(18)}`,
            object: 'thread.run',
            thread_id: threadId,
            assistant_id: (await getOpenaiAssistant({ select: { id: true } })).id,
            status: 'failed',
            failed_at: dayjs().unix(),
            last_error: {
              code: 'server_error',
              message: String(e?.message || e || 'Unknown error'),
            },
          } as any,
        })
      } finally {
        waitUntil(new Promise(async (resolve) => {
          if (responseCreatedResponse?.id && itemIds.length > 0) {
            await saveResponseItemsToConversationMetadata({
              client,
              threadId,
              responseId: responseCreatedResponse.id,
              itemIds,
            })
          }

          resolve(true)
        }))
      }
    }

    return {
      handleRun,
      getOpenaiAssistant,
    }
  }
