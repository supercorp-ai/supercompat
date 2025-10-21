import type Anthropic from '@anthropic-ai/sdk'
import type OpenAI from 'openai'
import { uid, fork, omit, isEmpty } from 'radash'
import { nonEmptyMessages } from '@/lib/messages/nonEmptyMessages'
import { alternatingMessages } from '@/lib/messages/alternatingMessages'
import { firstUserMessages } from '@/lib/messages/firstUserMessages'
import { serializeTools } from './serializeTools'
import { serializeMessages } from './serializeMessages'
import { serializeBetas } from './serializeBetas'

export const post = ({
  anthropic,
}: {
  anthropic: Anthropic
}) => async (_url: string, options: any) => {
  const body = JSON.parse(options.body)

  const messages = body.messages as OpenAI.ChatCompletionMessageParam[]
  const [systemMessages, otherMessages] = fork(messages, (message) => message.role === 'system')
  const system = systemMessages.map((message) => message.content).join('\n')

  const chatMessages = nonEmptyMessages({
    messages: firstUserMessages({
      messages: alternatingMessages({
        messages: otherMessages,
      }),
    }),
  })

  const resultOptions = {
    ...omit(body, ['response_format']),
    model: body.model,
    ...serializeBetas({
      tools: body.tools,
    }),
    stream: body.stream,
    system,
    messages: serializeMessages({
      messages: chatMessages,
    }),
    max_tokens: 4096,
    tools: serializeTools({
      tools: body.tools,
    }),
  }

  if (resultOptions.stream) {
    // @ts-ignore-next-line
    const response = await anthropic.beta.messages.create(resultOptions)

    const stream = new ReadableStream({
      async start(controller) {
        const blockIndexToToolUseId = new Map<number, string>()
        const toolUseIdToIndex = new Map<string, number>()
        let nextToolCallIndex = 0

        const getOrCreateIndexForToolUseId = (toolUseId?: string) => {
          if (!toolUseId) {
            return 0
          }

          if (!toolUseIdToIndex.has(toolUseId)) {
            toolUseIdToIndex.set(toolUseId, nextToolCallIndex++)
          }

          return toolUseIdToIndex.get(toolUseId) ?? 0
        }

        const assignBlockToToolUse = ({
          blockIndex,
          toolUseId,
        }: {
          blockIndex?: number
          toolUseId?: string
        }) => {
          if (typeof blockIndex === 'number' && toolUseId) {
            blockIndexToToolUseId.set(blockIndex, toolUseId)
          }
        }

        const getOrCreateIndexForBlock = (blockIndex?: number) => {
          if (typeof blockIndex !== 'number') {
            return 0
          }

          const toolUseId = blockIndexToToolUseId.get(blockIndex)
          return getOrCreateIndexForToolUseId(toolUseId)
        }

        for await (const chunk of response) {
          if (chunk.type === 'content_block_stop') {
            if (typeof chunk.index === 'number') {
              blockIndexToToolUseId.delete(chunk.index)
            }
            continue
          }

          if (chunk.type === 'content_block_delta') {
            let delta: { tool_calls?: any; content?: string | null }

            if (chunk.delta.type === 'input_json_delta') {
              const index = getOrCreateIndexForBlock(chunk.index)

              delta = {
                tool_calls: [
                  {
                    index,
                    function: {
                      arguments: chunk.delta.partial_json,
                    },
                  },
                ],
              }
            } else if ('text' in chunk.delta) {
              delta = {
                content: chunk.delta.text,
              }
            } else {
              delta = {
                content: '',
              }
            }

            const messageDelta = {
              id: `chatcmpl-${uid(29)}`,
              object: 'chat.completion.chunk',
              choices: [
                {
                  index: chunk.index,
                  delta,
                },
              ],
            }

            controller.enqueue(`data: ${JSON.stringify(messageDelta)}\n\n`)
          } else if (chunk.type === 'content_block_start') {
            let delta: { content: string | null; tool_calls?: any }

            if (chunk.content_block.type === 'tool_use') {
              const toolName = chunk.content_block.name as string
              const normalizedToolName = toolName === 'computer' ? 'computer_call' : toolName
              const index = getOrCreateIndexForToolUseId(chunk.content_block.id)
              assignBlockToToolUse({
                blockIndex: chunk.index,
                toolUseId: chunk.content_block.id,
              })

              delta = {
                content: null,
                tool_calls: [
                  {
                    index,
                    id: chunk.content_block.id,
                    type: 'function',
                    function: {
                      name: normalizedToolName,
                      arguments: '',
                    },
                  },
                ],
              }
            } else if (chunk.content_block.type === 'server_tool_use') {
              const index = getOrCreateIndexForToolUseId(chunk.content_block.id)
              assignBlockToToolUse({
                blockIndex: chunk.index,
                toolUseId: chunk.content_block.id,
              })

              delta = {
                content: null,
                tool_calls: [
                  {
                    index,
                    id: chunk.content_block.id,
                    type: 'function',
                    function: {
                      name: chunk.content_block.name as string,
                      arguments: '',
                    },
                  },
                ],
              }
            } else if (chunk.content_block.type === 'web_search_tool_result') {
              const outputPayload = {
                content: chunk.content_block.content ?? [],
              }
              const toolCallId =
                ((chunk.content_block as unknown as { tool_use_id?: string })
                  .tool_use_id ??
                  (chunk.content_block as unknown as { id?: string }).id) ?? ''
              const index = getOrCreateIndexForToolUseId(toolCallId)
              assignBlockToToolUse({
                blockIndex: chunk.index,
                toolUseId: toolCallId,
              })

              delta = {
                content: null,
                tool_calls: [
                  {
                    index,
                    id: toolCallId,
                    type: 'function',
                    function: {
                      output: JSON.stringify(outputPayload),
                    },
                  },
                ],
              }
            } else if (
              chunk.content_block.type === 'code_execution_tool_result' ||
              chunk.content_block.type === 'bash_code_execution_tool_result' ||
              chunk.content_block.type === 'python_code_execution_tool_result'
            ) {
              const toolCallId =
                ((chunk.content_block as unknown as { tool_use_id?: string })
                  .tool_use_id ??
                  (chunk.content_block as unknown as { id?: string }).id) ?? ''

              const {
                tool_use_id: _toolUseId,
                type: _type,
                id: _id,
                ...rest
              } = chunk.content_block as unknown as Record<string, unknown>
              const index = getOrCreateIndexForToolUseId(toolCallId)
              assignBlockToToolUse({
                blockIndex: chunk.index,
                toolUseId: toolCallId,
              })

              const outputPayload =
                Object.keys(rest).length > 0
                  ? rest
                  : {
                      content:
                        (chunk.content_block as unknown as {
                          content?: unknown
                        }).content ?? {},
                    }

              delta = {
                content: null,
                tool_calls: [
                  {
                    index,
                    id: toolCallId,
                    type: 'function',
                    function: {
                      output: JSON.stringify(outputPayload),
                    },
                  },
                ],
              }
            } else if ('text' in chunk.content_block) {
              delta = {
                content: chunk.content_block.text,
              }
            } else {
              delta = {
                content: '',
              }
            }

            const messageDelta = {
              id: `chatcmpl-${uid(29)}`,
              object: 'chat.completion.chunk',
              choices: [
                {
                  index: chunk.index,
                  delta,
                },
              ],
            }

            controller.enqueue(`data: ${JSON.stringify(messageDelta)}\n\n`)
          } else if (chunk.type === 'message_start') {
            const messageDelta = {
              id: `chatcmpl-${uid(29)}`,
              object: 'chat.completion.chunk',
              choices: [
                {
                  index: 0,
                  delta: {
                    content: '',
                  },
                },
              ],
            }

            controller.enqueue(`data: ${JSON.stringify(messageDelta)}\n\n`)
          }
        }

        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
      },
    })
  } else {
    try {
      // @ts-ignore-next-line
      const data = await anthropic.messages.create(resultOptions)

      return new Response(JSON.stringify({
        data,
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    } catch (error) {
      return new Response(JSON.stringify({
        error,
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    }
  }
}
