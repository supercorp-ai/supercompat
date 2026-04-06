import type { OpenAI } from 'openai'
import type { RequestHandler } from '@/types'
import { threadRegexp } from '@/openaiAssistants/lib/threads/threadRegexp'
import { serializeThread } from '../serializeThread'

export const thread = ({
  client,
}: {
  client: OpenAI
}): { get: RequestHandler; post: RequestHandler; delete: RequestHandler } => ({
  get: async (urlString: string) => {
    const url = new URL(urlString)
    const [, threadId] = url.pathname.match(new RegExp(threadRegexp))!

    const conversation = await client.conversations.retrieve(threadId)

    return new Response(JSON.stringify(serializeThread({ conversation })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  },

  post: async (urlString: string, options: any) => {
    const url = new URL(urlString)
    const [, threadId] = url.pathname.match(new RegExp(threadRegexp))!

    const body = typeof options?.body === 'string' ? JSON.parse(options.body) : {}

    const conversation = await client.conversations.update(threadId, {
      metadata: body.metadata ?? undefined,
    })

    return new Response(JSON.stringify(serializeThread({ conversation })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  },

  delete: async (urlString: string) => {
    const url = new URL(urlString)
    const [, threadId] = url.pathname.match(new RegExp(threadRegexp))!

    await client.conversations.delete(threadId)

    return new Response(JSON.stringify({
      id: threadId,
      object: 'thread.deleted',
      deleted: true,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  },
})
