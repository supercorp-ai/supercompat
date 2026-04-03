import type OpenAI from 'openai'
import type { AIProjectClient } from '@azure/ai-projects'
import dayjs from 'dayjs'
import { cancelRunRegexp } from '@/lib/runs/cancelRunRegexp'
import type { RequestHandler } from '@/types'

export const post = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}): RequestHandler => async (urlString: string) => {
  const url = new URL(urlString)
  const [, threadId, runId] = url.pathname.match(new RegExp(cancelRunRegexp))!

  const azureRun = await azureAiProject.agents.runs.cancel(threadId, runId)

  const openaiRun: OpenAI.Beta.Threads.Run = {
    id: azureRun.id,
    object: 'thread.run',
    created_at: dayjs(azureRun.createdAt).unix(),
    thread_id: azureRun.threadId,
    assistant_id: azureRun.assistantId,
    status: azureRun.status as any,
    required_action: null,
    last_error: null,
    expires_at: null,
    started_at: azureRun.startedAt ? dayjs(azureRun.startedAt).unix() : null,
    cancelled_at: azureRun.cancelledAt ? dayjs(azureRun.cancelledAt).unix() : dayjs().unix(),
    failed_at: null,
    completed_at: null,
    incomplete_details: null,
    model: azureRun.model || '',
    instructions: azureRun.instructions || '',
    tools: [],
    metadata: azureRun.metadata || {},
    temperature: null,
    top_p: null,
    max_prompt_tokens: null,
    max_completion_tokens: null,
    truncation_strategy: { type: 'auto', last_messages: null },
    response_format: 'auto',
    tool_choice: 'auto',
    parallel_tool_calls: true,
    usage: null,
  }

  return new Response(JSON.stringify(openaiRun), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
