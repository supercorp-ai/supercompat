import type OpenAI from 'openai'

export const post = ({
  humiris,
}: {
  humiris: OpenAI
}) => async (_url: string, options: any) => {
  const body = JSON.parse(options.body)

  if (body.stream) {
    const data = await humiris.chat.completions.create({
      ...body,
      stream: false,
    })

    const stream = new ReadableStream({
      async start(controller) {
        const chunk = {
          id: data.id,
          object: 'chat.completion.chunk',
          created: data.created,
          model: data.created,
          choices: [
            {
              index: 0,
              delta: {
                role: data.choices[0].message.role,
                content: data.choices[0].message.content,
              },
              logprobs: null,
              finish_reason: data.choices[0].finish_reason,
            }
          ]
        }

        controller.enqueue(`data: ${JSON.stringify(chunk)}\n\n`)
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
      const data = await humiris.chat.completions.create(body)

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
