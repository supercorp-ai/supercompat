import type Anthropic from '@anthropic-ai/sdk'
import type OpenAI from 'openai'
import { uid, fork, omit, isEmpty } from 'radash'
import { nonEmptyMessages } from '@/lib/messages/nonEmptyMessages'
import { alternatingMessages } from '@/lib/messages/alternatingMessages'
import { firstUserMessages } from '@/lib/messages/firstUserMessages'
import { serializeTools } from './serializeTools'
import { serializeMessages } from './serializeMessages'

export const post = ({
  anthropic,
}: {
  anthropic: Anthropic
}) =>
  async (
    _url: string,
    options: RequestInit & { body: string },
  ) => {
    const body = JSON.parse(options.body) as {
      messages: OpenAI.ChatCompletionMessageParam[]
      stream?: boolean
      tools?: OpenAI.Beta.AssistantTool[]
      [key: string]: unknown
    }

    const messages = body.messages
    const [systemMessages, otherMessages] = fork(
      messages,
      (message) => message.role === 'system',
    )
    const system = systemMessages.map((message) => message.content).join('\n')

    const chatMessages = nonEmptyMessages({
      messages: firstUserMessages({
        messages: alternatingMessages({
          messages: otherMessages,
        }),
      }),
    })

    const serializedMessages = serializeMessages({
      messages: chatMessages as OpenAI.ChatCompletionMessageParam[],
    })

    const baseOptions = {
      ...omit(body, ['response_format', 'stream']),
      system,
      messages: serializedMessages,
      max_tokens: 4096,
      tools: serializeTools({
        tools: body.tools,
      }) as unknown as Anthropic.Messages.ToolUnion[],
    }

    if (body.stream && isEmpty(body.tools)) {
      const response = await anthropic.messages.stream(
        baseOptions as Anthropic.Messages.MessageStreamParams,
      )

    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of response) {
          if (chunk.type === 'content_block_delta') {
            let delta:
              | { content: string }
              | {
                  tool_calls: {
                    index: number
                    function: { arguments: string }
                  }[]
                }
            if (chunk.delta.type === 'input_json_delta') {
              delta = {
                tool_calls: [
                  {
                    index: 0,
                    function: { arguments: chunk.delta.partial_json },
                  },
                ],
              }
            } else if (chunk.delta.type === 'text_delta') {
              delta = { content: chunk.delta.text }
            } else {
              continue
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
            let delta:
              | { content: string }
              | {
                  content: null
                  tool_calls: {
                    index: number
                    id: string
                    type: 'function'
                    function: { name: string; arguments: string }
                  }[]
                }
            if (chunk.content_block.type === 'tool_use') {
              delta = {
                content: null,
                tool_calls: [
                  {
                    index: 0,
                    id: chunk.content_block.id,
                    type: 'function',
                    function: {
                      name: chunk.content_block.name,
                      arguments: '',
                    },
                  },
                ],
              }
            } else if (chunk.content_block.type === 'text') {
              delta = { content: chunk.content_block.text }
            } else {
              continue
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
    }

    try {
      const data = await anthropic.messages.create({
        ...baseOptions,
        stream: false,
      } as Anthropic.Messages.MessageCreateParamsNonStreaming)

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
