import type OpenAI from 'openai'
import { serializeThread } from './serializeThread'

type ThreadCreateResponse = Response & {
  json: () => Promise<OpenAI.Beta.Threads.Thread>
}

export const post = ({
  client,
  addAnnotations = false,
}: {
  client: OpenAI
  addAnnotations?: boolean
}) => async (_urlString: string, options: RequestInit & { body?: string }): Promise<ThreadCreateResponse> => {
  if (typeof options.body !== 'string') {
    throw new Error('Request body is required')
  }

  const body = JSON.parse(options.body)

  const messages = body.messages || []
  const metadata = body.metadata || {}

  const conversation = await client.conversations.create({
    metadata,
    items: messages.map((message: OpenAI.Beta.ThreadCreateParams.Message) => {
      const contentType = message.role === 'user' ? 'input_text' : 'output_text'

      // Convert content to array format
      let contentArray: any[]

      if (typeof message.content === 'string') {
        // String content - convert to array format
        const contentItem: any = {
          type: contentType,
          text: message.content,
        }
        if (addAnnotations) {
          contentItem.annotations = []
        }
        contentArray = [contentItem]
      } else if (Array.isArray(message.content)) {
        // Array content - map each part
        contentArray = message.content.map((part: any) => {
          if (typeof part === 'string') {
            const item: any = {
              type: contentType,
              text: part,
            }
            if (addAnnotations) {
              item.annotations = []
            }
            return item
          }
          if (part.type === 'text') {
            const item: any = {
              type: contentType,
              text: part.text,
            }
            if (addAnnotations) {
              item.annotations = []
            }
            return item
          }
          if (part.type === 'image_file') {
            return {
              type: 'input_image',
              file_id: part.image_file.file_id,
              detail: part.image_file.detail ?? 'auto',
            }
          }
          if (part.type === 'image_url') {
            return {
              type: 'input_image',
              image_url: part.image_url.url,
              detail: part.image_url.detail ?? 'auto',
            }
          }
          const item: any = {
            type: contentType,
            text: '',
          }
          if (addAnnotations) {
            item.annotations = []
          }
          return item
        })
      } else {
        const contentItem: any = {
          type: contentType,
          text: '',
        }
        if (addAnnotations) {
          contentItem.annotations = []
        }
        contentArray = [contentItem]
      }

      return {
        type: "message",
        role: message.role === 'user' ? 'user' : 'assistant',
        content: contentArray,
      }
    }),
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
