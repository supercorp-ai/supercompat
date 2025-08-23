// @ts-nocheck
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

    // @ts-ignore
    const serializedMessages = serializeMessages({
      messages: chatMessages,
    })

    // @ts-ignore
    const resultOptions = {
      ...omit(body, ['response_format']),
      stream: body.stream ? isEmpty(body.tools) : false,
      system,
      messages: serializedMessages,
      max_tokens: 4096,
      tools: serializeTools({
        tools: body.tools,
      }),
    } as any

  if (body.stream) {
    const response = await anthropic.messages.stream(resultOptions as any)

    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of response) {
          if (chunk.type === 'content_block_delta') {
              const delta = (chunk.delta as any).type === 'input_json_delta' ? {
                tool_calls: [
                  {
                    index: 0,
                    function: {
                      arguments: (chunk.delta as any).partial_json,
                    },
                  },
                ]
              } : {
                content: (chunk.delta as any).text,
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
              const delta = (chunk.content_block as any).type === 'tool_use' ? {
                content: null,
                tool_calls: [
                  {
                    index: 0,
                    id: (chunk.content_block as any).id,
                    type: 'function',
                    function: {
                      name: (chunk.content_block as any).name,
                      arguments: '',
                    }
                  }
                ],
              } : {
                content: (chunk.content_block as any).text,
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
      const data = await anthropic.messages.create(resultOptions as any)

      return new Response(JSON.stringify({
        data,
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    } catch (error: unknown) {
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
