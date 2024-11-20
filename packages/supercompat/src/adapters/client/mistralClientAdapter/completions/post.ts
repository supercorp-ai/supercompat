import type { Mistral } from '@mistralai/mistralai'
import { serializeChunk } from './serializeChunk'
import { serializeBody } from './serializeBody'

export const post = ({
  mistral,
}: {
  mistral: Mistral
}) => async (_url: string, options: any) => {
  const body = JSON.parse(options.body)
  const serializedBody = serializeBody({
    body,
  })

  if (body.stream) {
    const response = await mistral.chat.stream(serializedBody)

    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of response) {
          const serializedChunk = serializeChunk({
            chunk,
          })

          controller.enqueue(`data: ${JSON.stringify(serializedChunk)}\n\n`)
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
      const data = await mistral.chat.complete(serializedBody)

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
