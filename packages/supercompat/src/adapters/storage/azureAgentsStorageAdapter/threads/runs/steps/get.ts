import type { AIProjectsClient, RunStepOutput } from '@azure/ai-projects'
import { assign, last } from 'radash'
import { stepsRegexp } from '@/lib/steps/stepsRegexp'
import { serializeRunStep } from './serializeRunStep'

export const get = ({
  azureAiProjectsClient,
}: {
  azureAiProjectsClient: AIProjectsClient
}) => async (urlString: string) => {
  const url = new URL(urlString)

  const [, threadId,, runId] = url.pathname.match(new RegExp(stepsRegexp))!

  const {
    limit,
    order,
    after,
  } = assign({
    limit: '20',
    order: 'desc',
    // after: null,
  }, Object.fromEntries(url.searchParams))

  const response = await azureAiProjectsClient.agents.listRunSteps(threadId, runId, {
    limit: parseInt(limit),
    order: order as 'asc' | 'desc',
    after,
  })

  return new Response(JSON.stringify({
    data: response.data.map((runStep: RunStepOutput) => (
      serializeRunStep({ runStep })
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
