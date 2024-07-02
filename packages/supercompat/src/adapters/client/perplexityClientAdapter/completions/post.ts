import type OpenAI from 'openai'

const agentSideRoles = ['assistant', 'system']

export const post = ({
  perplexity,
}: {
  perplexity: OpenAI
}) => async (_url: string, options: any) => {
  const body = JSON.parse(options.body)

  const messages = [] as OpenAI.Chat.ChatCompletionMessageParam[]

  body.messages.forEach((message: OpenAI.Chat.ChatCompletionMessageParam, index: number) => {
    messages.push(message)

    const nextMessage = body.messages[index + 1]
    if (!nextMessage) return

    if (message.role === 'user' && nextMessage.role === 'user') {
      messages.push({
        role: 'assistant',
        content: '',
      })
    } else if (agentSideRoles.includes(message.role) && agentSideRoles.includes(nextMessage.role)) {
      messages.push({
        role: 'user',
        content: '',
      })
    }
  })

  if (body.stream) {
    const response = await perplexity.chat.completions.create(body)

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
      const data = await perplexity.chat.completions.create(body)

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
