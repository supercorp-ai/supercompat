import type OpenAI from 'openai'

const encoder = new TextEncoder()

// Together models (e.g. gpt-oss) sometimes leak control tokens into content
const controlTokenPattern = /<\|[a-z_]+\|>/g

const stripControlTokens = (chunk: any) => {
  const delta = chunk?.choices?.[0]?.delta
  if (delta?.content && typeof delta.content === 'string') {
    delta.content = delta.content.replace(controlTokenPattern, '')
  }
  return chunk
}

export const post = ({
  together,
}: {
  together: OpenAI
}) => async (_url: string, options: any) => {
  const body = JSON.parse(options.body)

  if (body.stream) {
    const response = await together.chat.completions.create(body)

    const stream = new ReadableStream({
      async start(controller) {
        // @ts-ignore-next-line
        for await (const chunk of response) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(stripControlTokens(chunk))}\n\n`))
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
      const data = await together.chat.completions.create(body)

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
