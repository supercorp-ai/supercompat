import type { OpenAI } from 'openai'
import type { RequestHandler, RunAdapterWithAssistant } from '@/types'
import { messageRegexp } from '@/openaiAssistants/lib/messages/messageRegexp'
import { serializeItemAsMessage } from '@/openaiAssistants/lib/items/serializeItemAsMessage'
import { responseId } from '@/openaiAssistants/lib/items/responseId'

export const message = ({
  client,
  runAdapter,
}: {
  client: OpenAI
  runAdapter: RunAdapterWithAssistant
}): { get: RequestHandler } => ({
  get: async (urlString: string) => {
    const url = new URL(urlString)
    const [, threadId, messageId] = url.pathname.match(new RegExp(messageRegexp))!

    const conversation = await client.conversations.retrieve(threadId)
    const item = await client.conversations.items.retrieve(messageId, { conversation_id: threadId })
    const openaiAssistant = await runAdapter.getOpenaiAssistant({ select: { id: true } })

    const runId = responseId({ conversation, itemId: messageId })

    return new Response(JSON.stringify(
      serializeItemAsMessage({
        item: item as any,
        threadId,
        openaiAssistant,
        createdAt: conversation.created_at,
        runId,
      }),
    ), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  },
})
