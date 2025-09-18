import dayjs from 'dayjs'
import { uid } from 'radash'
import type OpenAI from 'openai'
import { serializeResponseAsRun } from '@/lib/responses/serializeResponseAsRun'
import { serializeItemAsMessage } from '@/lib/items/serializeItemAsMessage'
import { serializeItemAsRunStep } from '@/lib/items/serializeItemAsRunStep'
import { saveResponseItemsToConversationMetadata } from '@/lib/responses/saveResponseItemsToConversationMetadata'

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
    openai,
    openaiAssistant,
  }: {
    openai: OpenAI
    openaiAssistant: OpenAI.Beta.Assistants.Assistant
  }) =>
  async ({
    threadId,
    response,
    onEvent,
  }: {
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
                assistantId: openaiAssistant.id,
              }),
            })
            break

          case 'response.in_progress':
            await onEvent({
              event: 'thread.run.in_progress',
              data: serializeResponseAsRun({
                response: event.response,
                assistantId: openaiAssistant.id,
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
                    assistantId: openaiAssistant.id,
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
                  assistantId: openaiAssistant.id,
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
                assistantId: openaiAssistant.id,
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
                event: 'thread.run.step.created',
                data: serializeItemAsRunStep({
                  item: event.item,
                  items: [],
                  threadId,
                  openaiAssistant,
                  runId: responseCreatedResponse!.id,
                  status: 'in_progress',
                  completedAt: null,
                })
              })

              await onEvent({
                event: 'thread.message.created',
                data: serializeItemAsMessage({
                  item: event.item,
                  threadId,
                  openaiAssistant,
                  createdAt: dayjs().unix(),
                  runId: responseCreatedResponse!.id,
                  status: 'in_progress',
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
                  openaiAssistant,
                  runId: responseCreatedResponse!.id,
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
                data: serializeItemAsRunStep({
                  item: event.item,
                  items: [],
                  threadId,
                  openaiAssistant,
                  runId: responseCreatedResponse!.id,
                })
              })

              await onEvent({
                event: 'thread.message.completed',
                data: serializeItemAsMessage({
                  item: event.item,
                  threadId,
                  openaiAssistant,
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
                  openaiAssistant,
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
          //
          // case 'response.function_call_arguments.done': {
          //   break
          // }

          default:
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
          assistant_id: openaiAssistant.id,
          status: 'failed',
          failed_at: dayjs().unix(),
          last_error: {
            code: 'server_error',
            message: String(e?.message || e || 'Unknown error'),
          },
        } as any,
      })
    } finally {
      // One final metadata write using the best-known list (final if completed, partial otherwise)
      if (responseCreatedResponse?.id && itemIds.length > 0) {
        await saveResponseItemsToConversationMetadata({
          openai,
          threadId,
          responseId: responseCreatedResponse.id,
          itemIds,
        })
      }
    }
  }
