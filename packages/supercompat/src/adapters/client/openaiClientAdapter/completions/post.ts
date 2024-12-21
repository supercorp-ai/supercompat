import type OpenAI from 'openai'
import { omit } from 'radash'
import { systemDeveloperMessages } from '@/lib/messages/systemDeveloperMessages'
import { isOModel } from '@/lib/models/isOModel'

const omitKeys = ({
  model,
}: {
  model: string
}) => {
  if (isOModel({ model })) {
    return ['tools']
  }

  return []
}

export const post = ({
  openai,
}: {
  openai: OpenAI
}) => async (_url: string, options: any) => {
  const body = JSON.parse(options.body)
  const messages = body.messages as OpenAI.ChatCompletionMessageParam[]

  const resultOptions = {
    ...omit(body, omitKeys({ model: body.model })),
    messages: systemDeveloperMessages({
      messages,
      model: body.model,
    }),
  } as OpenAI.Chat.ChatCompletionCreateParams

  if (body.stream) {
    const response = await openai.chat.completions.create(resultOptions)

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
      const data = await openai.chat.completions.create(resultOptions)

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
