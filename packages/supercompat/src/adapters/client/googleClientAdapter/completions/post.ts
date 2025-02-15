import type OpenAI from 'openai'
import { createId } from '@paralleldrive/cuid2'
import { nonEmptyMessages } from '@/lib/messages/nonEmptyMessages'

export const post = ({
  google,
}: {
  google: OpenAI
}) => async (_url: string, options: any) => {
  const body = JSON.parse(options.body)

  const resultOptions = {
    ...body,
    messages: nonEmptyMessages({
      messages: body.messages,
    }),
  }

  if (body.stream) {
    const response = await google.chat.completions.create(resultOptions)

    const stream = new ReadableStream({
      async start(controller) {
        // @ts-ignore-next-line
        for await (const chunk of response) {
          let resultChunk

          if (chunk.choices) {
            const newChoices = chunk.choices.map((choice: any) => {
              if (choice.delta?.tool_calls) {
                return {
                  ...choice,
                  delta: {
                    ...choice.delta,
                    tool_calls: choice.delta.tool_calls.map((toolCall: any) => {
                      if (toolCall.id === '') {
                        return {
                          ...toolCall,
                          id: `call_${createId()}`,
                        }
                      }

                      return toolCall
                    }),
                  },
                }
              } else {
                return choice
              }
            })

            resultChunk = {
              ...chunk,
              choices: newChoices,
            }
          } else {
            resultChunk = chunk
          }

          controller.enqueue(`data: ${JSON.stringify(resultChunk)}\n\n`)
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
      const data = await google.chat.completions.create(resultOptions)

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
