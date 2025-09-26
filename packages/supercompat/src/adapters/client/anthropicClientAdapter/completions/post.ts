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
    stream: body.stream ? isEmpty(body.tools) : false,
    system,
    messages: serializeMessages({
      messages: chatMessages,
    }),
    max_tokens: 4096,
    tools: serializeTools({
      tools: body.tools,
    }),
  }

  if (body.stream) {
    // @ts-ignore-next-line
    const response = await anthropic.messages.stream(resultOptions)

    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of response) {
          if (chunk.type === 'content_block_delta') {
            let delta: { tool_calls?: any; content?: string | null }

            if (chunk.delta.type === 'input_json_delta') {
              delta = {
                tool_calls: [
                  {
                    index: 0,
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
