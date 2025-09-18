import type OpenAI from 'openai'
import { serializeThread } from './serializeThread'

type ThreadCreateResponse = Response & {
  json: () => Promise<OpenAI.Beta.Threads.Thread>
}

export const post = ({
  client,
}: {
  client: OpenAI
}) => async (urlString: string, options: RequestInit & { body: string }): Promise<ThreadCreateResponse> => {
  const body = JSON.parse(options.body)

  const messages = body.messages || []
  const metadata = body.metadata || {}

  const conversation = await client.conversations.create({
    metadata,
    items: messages.map((message: OpenAI.Beta.ThreadCreateParams.Message) => ({
      type: "message",
      role: message.role === 'user' ? 'user' : 'assistant',
      content: [
        {
          type: message.role === 'user' ? 'input_text' : 'output_text',
          text: message.content,
        },
      ],
    })),
  });

  return new Response(JSON.stringify(
    serializeThread({ conversation }),
  ), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
