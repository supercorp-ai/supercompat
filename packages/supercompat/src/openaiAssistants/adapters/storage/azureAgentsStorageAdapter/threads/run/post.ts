import type OpenAI from 'openai'
import type { AIProjectClient } from '@azure/ai-projects'
import dayjs from 'dayjs'
import type { RequestHandler } from '@/types'
import { runRegexp } from '@/openaiAssistants/lib/runs/runRegexp'

export const post = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}): RequestHandler => async (urlString: string, options: RequestInit & { body?: string }) => {
  const url = new URL(urlString)
  const [, threadId, runId] = url.pathname.match(new RegExp(runRegexp))!

  const body = JSON.parse(options.body || '{}')

  const azureRun = await azureAiProject.agents.runs.update(threadId, runId, {
    metadata: body.metadata,
  })

  const openaiRun: OpenAI.Beta.Threads.Run = {
    id: azureRun.id,
    object: 'thread.run',
    created_at: dayjs(azureRun.createdAt).unix(),
    thread_id: azureRun.threadId,
    assistant_id: azureRun.assistantId,
    status: azureRun.status as any,
    required_action:
      azureRun.status === 'requires_action' && azureRun.requiredAction
        ? {
            type: 'submit_tool_outputs',
            submit_tool_outputs: {
              tool_calls: (azureRun.requiredAction as any).submitToolOutputs.toolCalls.map(
                (tc: any) => ({
                  id: tc.id,
                  type: 'function' as const,
                  function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                  },
                }),
              ),
            },
          }
        : null,
    last_error: azureRun.lastError
      ? {
          code: 'server_error',
          message: JSON.stringify(azureRun.lastError),
        }
      : null,
    expires_at: null,
    started_at: dayjs(azureRun.createdAt).unix(),
    cancelled_at: null,
    failed_at: azureRun.status === 'failed' ? dayjs().unix() : null,
    completed_at: azureRun.completedAt ? dayjs(azureRun.completedAt).unix() : null,
    incomplete_details: null,
    model: azureRun.model || '',
    instructions: azureRun.instructions || '',
    tools: [],
    metadata: azureRun.metadata || {},
    temperature: null,
    top_p: null,
    max_prompt_tokens: null,
    max_completion_tokens: null,
    truncation_strategy: {
      type: 'auto',
      last_messages: null,
    },
    response_format: 'auto',
    tool_choice: 'auto',
    parallel_tool_calls: true,
    usage: azureRun.usage ? {
      prompt_tokens: (azureRun.usage as any).promptTokens ?? 0,
      completion_tokens: (azureRun.usage as any).completionTokens ?? 0,
      total_tokens: (azureRun.usage as any).totalTokens ?? 0,
    } : null,
  }

  return new Response(JSON.stringify(openaiRun), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
