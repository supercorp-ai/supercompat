import type { AIProjectsClient, ThreadMessageOutput } from '@azure/ai-projects'
import type OpenAI from 'openai'
import { assign, last } from 'radash'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'
import { serializeMessage } from './serializeMessage'

type MessageCreateResponse = Response & {
  json: () => Promise<ReturnType<OpenAI.Beta.Threads.Messages['create']>>
}

export const get = ({
  azureAiProjectsClient,
}: {
  azureAiProjectsClient: AIProjectsClient
}) => async (urlString: string): Promise<MessageCreateResponse> => {
  const url = new URL(urlString)

  const [, threadId] = url.pathname.match(new RegExp(messagesRegexp))!

  const {
    limit,
    order,
    after,
  } = assign({
    limit: '20',
    order: 'desc',
    // after: null,
  }, Object.fromEntries(url.searchParams))

  const response = await azureAiProjectsClient.agents.listMessages(threadId, {
    limit: parseInt(limit),
    order: order as 'asc' | 'desc',
    after,
  })

  return new Response(JSON.stringify({
    data: response.data.map((message: ThreadMessageOutput) => (
      serializeMessage({ message })
    )),
    hasNextPage: () => response.hasMore,
    last_id: response.lastId,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
