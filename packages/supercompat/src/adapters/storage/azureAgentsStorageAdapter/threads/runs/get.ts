import type OpenAI from 'openai'
import type { AIProjectsClient, ThreadRunOutput } from '@azure/ai-projects'
import { assign, last } from 'radash'
import { runsRegexp } from '@/lib/runs/runsRegexp'
import { serializeRun } from './serializeRun'

type MessageCreateResponse = Response & {
  json: () => Promise<ReturnType<OpenAI.Beta.Threads.Messages['create']>>
}

export const get = ({
  azureAiProjectsClient,
}: {
  azureAiProjectsClient: AIProjectsClient
}) => async (urlString: string): Promise<MessageCreateResponse> => {
  const url = new URL(urlString)

  const [, threadId] = url.pathname.match(new RegExp(runsRegexp))!

  const {
    limit,
    order,
    after,
    before,
  } = assign({
    limit: '20',
    order: 'desc',
    // after: null,
  }, Object.fromEntries(url.searchParams))

  const response = await azureAiProjectsClient.agents.listRuns(threadId, {
    limit: parseInt(limit),
    order: order as 'asc' | 'desc',
    after,
    before,
  })

  return new Response(JSON.stringify({
    data: response.data.map((run: ThreadRunOutput) => (
      serializeRun({ run })
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
