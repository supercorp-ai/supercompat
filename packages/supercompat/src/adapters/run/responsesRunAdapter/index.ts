import dayjs from 'dayjs'
import { uid } from 'radash'
import type OpenAI from 'openai'
import { serializeResponseAsRun } from '@/lib/responses/serializeResponseAsRun'
import { serializeItemAsMessage } from '@/lib/items/serializeItemAsMessage'
import { serializeItemAsRunStep } from '@/lib/items/serializeItemAsRunStep'

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

/* ======================= self-contained metadata helpers ======================= */

type ItemResponseEntry = { responseId: string; itemIds: string[] }
type ConversationMetadata = Record<string, string>

const BUCKET_PREFIX = 'responseItemsMap'        // keys: responseItemsMap0..15
const MAX_BUCKETS = 16                          // total metadata key slots we’ll use
const MAX_VALUE_LENGTH = 512                    // OpenAI metadata value limit

function parseBucket({ value }: { value?: string }): ItemResponseEntry[] {
  if (!value || value === '[]') return []
  try {
    const arr = JSON.parse(value)
    return Array.isArray(arr) ? (arr as ItemResponseEntry[]) : []
  } catch {
    return []
  }
}

function serializeBucket({ entries }: { entries: ItemResponseEntry[] }): string {
  return JSON.stringify(entries) // minified JSON
}

function bucketKey({ index }: { index: number }): string {
  return `${BUCKET_PREFIX}${index}`
}

function listBucketIndices({ metadata }: { metadata: ConversationMetadata }): number[] {
  return Object.keys(metadata)
    .map((k) => {
      const m = new RegExp(`^${BUCKET_PREFIX}(\\d+)$`).exec(k)
      return m ? Number(m[1]) : -1
    })
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)
}

// Flatten to FIFO (oldest → newest) list of pairs
function parseAllPairs({ metadata }: { metadata: ConversationMetadata }): Array<{ responseId: string; itemId: string }> {
  const indices = listBucketIndices({ metadata })
  const pairs: Array<{ responseId: string; itemId: string }> = []
  for (const idx of indices) {
    const key = bucketKey({ index: idx })
    const entries = parseBucket({ value: metadata[key] })
    for (const e of entries) {
      for (const iid of e.itemIds) {
        pairs.push({ responseId: e.responseId, itemId: iid })
      }
    }
  }
  return pairs
}

// Pack pairs into up to 16 buckets of <=512 chars each
function tryPackPairs({
  baseMetadata,
  pairs,
}: {
  baseMetadata: ConversationMetadata
  pairs: Array<{ responseId: string; itemId: string }>
}): { success: boolean; newMetadata: ConversationMetadata } {
  const newBuckets: string[] = []
  let currentEntries: ItemResponseEntry[] = []

  const flush = () => {
    newBuckets.push(serializeBucket({ entries: currentEntries }))
    currentEntries = []
  }

  for (const { responseId, itemId } of pairs) {
    // tentative append to current bucket
    const next = currentEntries.map((e) => ({ responseId: e.responseId, itemIds: [...e.itemIds] }))
    const last = next[next.length - 1]
    if (last && last.responseId === responseId) {
      last.itemIds.push(itemId)
    } else {
      next.push({ responseId, itemIds: [itemId] })
    }

    const candidate = serializeBucket({ entries: next })
    if (candidate.length <= MAX_VALUE_LENGTH) {
      currentEntries = next
      continue
    }

    // would overflow -> flush current bucket and start new one
    flush()
    if (newBuckets.length >= MAX_BUCKETS) {
      // would require a 17th bucket
      return { success: false, newMetadata: baseMetadata }
    }
    currentEntries = [{ responseId, itemIds: [itemId] }]
  }

  if (currentEntries.length > 0) flush()

  // rebuild final metadata: keep non-bucket keys, replace bucket keys
  const result: ConversationMetadata = {}
  for (const [k, v] of Object.entries(baseMetadata)) {
    if (!k.startsWith(BUCKET_PREFIX)) result[k] = v
  }
  newBuckets.forEach((val, i) => {
    if (val && val !== '[]') result[bucketKey({ index: i })] = val
  })
  return { success: true, newMetadata: result }
}

// Public entry: append new itemIds for a responseId; evict oldest pairs until it fits
function appendItemIdsToConversationMetadata({
  metadata,
  responseId,
  itemIds,
}: {
  metadata?: ConversationMetadata
  responseId: string
  itemIds: string[]
}): ConversationMetadata {
  const base = { ...(metadata || {}) }
  const existing = parseAllPairs({ metadata: base })
  const nextPairs = existing.concat(itemIds.map((id) => ({ responseId, itemId: id })))

  let working = nextPairs
  // loop: try pack -> if over capacity, drop exactly one oldest pair and retry
  // this is deterministic, simple, and safe
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { success, newMetadata } = tryPackPairs({ baseMetadata: base, pairs: working })
    if (success) return newMetadata
    if (working.length === 0) {
      throw new Error('responseItemsMap: cannot pack even a single item into 16 buckets')
    }
    working = working.slice(1) // evict one oldest
  }
}

/** Save helper with NO retries: if the conversation is locked, this will throw. */
async function saveResponseItemsToConversationMetadata({
  openai,
  threadId,
  responseId,
  itemIds,
}: {
  openai: OpenAI
  threadId: string
  responseId: string
  itemIds: string[]
}) {
  const conversation = await openai.conversations.retrieve(threadId)
  const updated = appendItemIdsToConversationMetadata({
    metadata: conversation.metadata as Record<string, string> | undefined,
    responseId,
    itemIds,
  })
  await openai.conversations.update(threadId, { metadata: updated })
}

/* ======================= end self-contained metadata helpers ======================= */

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
