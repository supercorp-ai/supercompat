import dayjs from 'dayjs'
import { uid } from 'radash'
import type OpenAI from 'openai'
import { serializeResponseAsRun } from '@/lib/responses/serializeResponseAsRun'
import { serializeItemAsMessage } from '@/lib/items/serializeItemAsMessage'
import { serializeItemAsRunStep } from '@/lib/items/serializeItemAsRunStep'
import { saveResponseItemsToConversationMetadata } from '@/lib/responses/saveResponseItemsToConversationMetadata'
import { serializeItemAsImageGenerationRunStep } from '@/lib/items/serializeItemAsImageGenerationRunStep'
import { serializeItemAsWebSearchRunStep } from '@/lib/items/serializeItemAsWebSearchRunStep'

const serializeToolCalls = ({
  toolCalls,
}: {
  toolCalls: OpenAI.Responses.ResponseFunctionToolCall[]
}) => (
  toolCalls.map((toolCall) => ({
    id: toolCall.call_id,
    type: 'function' as const,
    function: {
      name: toolCall.name,
      arguments: toolCall.arguments,
    },
  }))
)

export const responsesRunAdapter =
  ({
    getOpenaiAssistant: getDirectOpenaiAssistant,
  }: {
    getOpenaiAssistant: () => Promise<OpenAI.Beta.Assistants.Assistant> | OpenAI.Beta.Assistants.Assistant
  }) => {
    let cachedOpenaiAssistant: OpenAI.Beta.Assistants.Assistant | null = null

    const getOpenaiAssistant = async () => {
      if (cachedOpenaiAssistant) return cachedOpenaiAssistant

      cachedOpenaiAssistant = await getDirectOpenaiAssistant()
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
      const toolCalls: Record<string, OpenAI.Responses.ResponseFunctionToolCall> = {}

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
                  assistantId: (await getOpenaiAssistant()).id,
                }),
              })
              break

            case 'response.in_progress':
              await onEvent({
                event: 'thread.run.in_progress',
                data: serializeResponseAsRun({
                  response: event.response,
                  assistantId: (await getOpenaiAssistant()).id,
                }),
              })
              break

            case 'response.completed': {
              itemIds = event.response.output.filter((o) => o.id).map((o) => o.id!)

              const toolCalls = event.response.output.filter((o) => o.type === 'function_call') as OpenAI.Responses.ResponseFunctionToolCall[]

              if (toolCalls.length > 0) {
                await onEvent({
                  event: 'thread.run.requires_action',
                  data: {
                    ...serializeResponseAsRun({
                      response: event.response,
                      assistantId: (await getOpenaiAssistant()).id,
                    }),
                    ...({
                      status: 'requires_action',
                      required_action: {
                        type: 'submit_tool_outputs',
                        submit_tool_outputs: {
                          tool_calls: serializeToolCalls({
                            toolCalls,
                          }),
                        },
                      },
                    }),
                  }
                })
              } else {
                await onEvent({
                  event: 'thread.run.completed',
                  data: serializeResponseAsRun({
                    response: event.response,
                    assistantId: (await getOpenaiAssistant()).id,
                  }),
                })
              }
              break
            }

            case 'response.failed': {
              await onEvent({
                event: 'thread.run.failed',
                data: serializeResponseAsRun({
                  response: event.response,
                  assistantId: (await getOpenaiAssistant()).id,
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
                    content: [{ type: 'text', index: event.output_index - 1, text: { value: event.delta } }],
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
                    openaiAssistant: await getOpenaiAssistant(),
                    createdAt: dayjs().unix(),
                    runId: responseCreatedResponse!.id,
                    status: 'in_progress',
                  })
                })

                await onEvent({
                  event: 'thread.run.step.created',
                  data: serializeItemAsRunStep({
                    item: event.item,
                    items: [],
                    threadId,
                    openaiAssistant: await getOpenaiAssistant(),
                    runId: responseCreatedResponse!.id,
                    status: 'in_progress',
                    completedAt: null,
                  })
                })
              } else if (event.item.type === 'function_call') {
                toolCalls[event.item.id!] = event.item

                await onEvent({
                  event: 'thread.run.step.created',
                  data: serializeItemAsRunStep({
                    item: event.item,
                    items: [],
                    threadId,
                    openaiAssistant: await getOpenaiAssistant(),
                    runId: responseCreatedResponse!.id,
                  })
                })
              } else if (event.item.type === 'image_generation_call') {
                await onEvent({
                  event: 'thread.message.created',
                  data: serializeItemAsMessage({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant(),
                    createdAt: dayjs().unix(),
                    runId: responseCreatedResponse!.id,
                    status: 'in_progress',
                  })
                })

                await onEvent({
                  event: 'thread.run.step.created',
                  data: serializeItemAsRunStep({
                    item: event.item,
                    items: [],
                    threadId,
                    openaiAssistant: await getOpenaiAssistant(),
                    runId: responseCreatedResponse!.id,
                    status: 'in_progress',
                    completedAt: null,
                  })
                })

                await onEvent({
                  event: 'thread.run.step.created',
                  data: serializeItemAsImageGenerationRunStep({
                    item: event.item,
                    openaiAssistant: await getOpenaiAssistant(),
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
                    openaiAssistant: await getOpenaiAssistant(),
                    createdAt: dayjs().unix(),
                    runId: responseCreatedResponse!.id,
                    status: 'in_progress',
                  })
                })

                await onEvent({
                  event: 'thread.run.step.created',
                  data: serializeItemAsRunStep({
                    item: event.item,
                    items: [],
                    threadId,
                    openaiAssistant: await getOpenaiAssistant(),
                    runId: responseCreatedResponse!.id,
                    status: 'in_progress',
                    completedAt: null,
                  })
                })

                await onEvent({
                  event: 'thread.run.step.created',
                  data: serializeItemAsWebSearchRunStep({
                    item: event.item,
                    openaiAssistant: await getOpenaiAssistant(),
                    threadId,
                    runId: responseCreatedResponse!.id,
                    completedAt: null,
                  })
                })
              }

              console.dir({ added: 1, event }, { depth: null })

              if (event.item.id) itemIds.push(event.item.id)

              break
            }

            case 'response.output_item.done': {
              if (event.item.type === 'message') {
                await onEvent({
                  event: 'thread.run.step.completed',
                  data: serializeItemAsRunStep({
                    item: event.item,
                    items: [],
                    threadId,
                    openaiAssistant: await getOpenaiAssistant(),
                    runId: responseCreatedResponse!.id,
                  })
                })

                await onEvent({
                  event: 'thread.message.completed',
                  data: serializeItemAsMessage({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant(),
                    createdAt: dayjs().unix(),
                    runId: responseCreatedResponse!.id,
                  })
                })
              } else if (event.item.type === 'function_call') {
                toolCalls[event.item.id!] = event.item

                await onEvent({
                  event: 'thread.run.step.in_progress',
                  data: serializeItemAsRunStep({
                    item: event.item,
                    items: [],
                    threadId,
                    openaiAssistant: await getOpenaiAssistant(),
                    runId: responseCreatedResponse!.id,
                  })
                })
              } else if (event.item.type === 'image_generation_call') {
                await onEvent({
                  event: 'thread.run.step.completed',
                  data: serializeItemAsImageGenerationRunStep({
                    item: event.item,
                    openaiAssistant: await getOpenaiAssistant(),
                    threadId,
                    runId: responseCreatedResponse!.id,
                  })
                })

                await onEvent({
                  event: 'thread.run.step.completed',
                  data: serializeItemAsRunStep({
                    item: event.item,
                    items: [],
                    threadId,
                    openaiAssistant: await getOpenaiAssistant(),
                    runId: responseCreatedResponse!.id,
                  })
                })

                await onEvent({
                  event: 'thread.message.completed',
                  data: serializeItemAsMessage({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant(),
                    createdAt: dayjs().unix(),
                    runId: responseCreatedResponse!.id,
                  })
                })
              } else if (event.item.type === 'web_search_call') {
                await onEvent({
                  event: 'thread.run.step.completed',
                  data: serializeItemAsWebSearchRunStep({
                    item: event.item,
                    openaiAssistant: await getOpenaiAssistant(),
                    threadId,
                    runId: responseCreatedResponse!.id,
                  })
                })

                await onEvent({
                  event: 'thread.run.step.completed',
                  data: serializeItemAsRunStep({
                    item: event.item,
                    items: [],
                    threadId,
                    openaiAssistant: await getOpenaiAssistant(),
                    runId: responseCreatedResponse!.id,
                  })
                })

                await onEvent({
                  event: 'thread.message.completed',
                  data: serializeItemAsMessage({
                    item: event.item,
                    threadId,
                    openaiAssistant: await getOpenaiAssistant(),
                    createdAt: dayjs().unix(),
                    runId: responseCreatedResponse!.id,
                  })
                })
              }

              console.dir({ done: 1, event }, { depth: null })

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
                  assistant_id: (await getOpenaiAssistant()).id,
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
                  assistant_id: (await getOpenaiAssistant()).id,
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
              console.dir({ else: 1, event }, { depth: null })
              break
          }
        }
      } catch (e: any) {
        await onEvent({
          event: 'thread.run.failed',
          data: {
            id: responseCreatedResponse?.id || `run_${uid(18)}`,
            object: 'thread.run',
            thread_id: threadId,
            assistant_id: (await getOpenaiAssistant()).id,
            status: 'failed',
            failed_at: dayjs().unix(),
            last_error: {
              code: 'server_error',
              message: String(e?.message || e || 'Unknown error'),
            },
          } as any,
        })
      } finally {
        if (responseCreatedResponse?.id && itemIds.length > 0) {
          await saveResponseItemsToConversationMetadata({
            client,
            threadId,
            responseId: responseCreatedResponse.id,
            itemIds,
          })
        }
      }
    }

    return {
      handleRun,
      getOpenaiAssistant,
    }
  }
