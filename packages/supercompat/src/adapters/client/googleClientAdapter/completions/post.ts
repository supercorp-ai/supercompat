import type OpenAI from 'openai'

export const post = ({
  google,
}: {
  google: OpenAI
}) => async (_url: string, options: any) => {
  const body = JSON.parse(options.body)

  if (body.stream) {
    const response = await google.chat.completions.create(body)
    console.dir({ response }, { depth: null })

    const stream = new ReadableStream({
      async start(controller) {
        // @ts-ignore-next-line
        for await (const chunk of response) {
          controller.enqueue(`data: ${JSON.stringify(chunk)}\n\n`)
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
      const data = await google.chat.completions.create(body)
      console.dir({ data }, { depth: null })

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
