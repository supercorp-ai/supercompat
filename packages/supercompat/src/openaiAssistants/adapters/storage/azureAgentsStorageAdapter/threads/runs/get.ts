import type OpenAI from 'openai'
import type { AIProjectClient } from '@azure/ai-projects'
import dayjs from 'dayjs'
import { runsRegexp } from '@/openaiAssistants/lib/runs/runsRegexp'

type RunListResponse = Response & {
  json: () => Promise<OpenAI.Beta.Threads.Runs.RunsPage>
}

export const get =
  ({
    azureAiProject,
  }: {
    azureAiProject: AIProjectClient
  }) =>
  async (urlString: string): Promise<RunListResponse> => {
    const url = new URL(urlString)
    const [, threadId] = url.pathname.match(new RegExp(runsRegexp))!

    const azureRuns = await azureAiProject.agents.runs.list(threadId)

    const runsList: OpenAI.Beta.Threads.Run[] = []
    for await (const azureRun of azureRuns) {
      runsList.push({
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
      })
    }

    const response = {
      data: runsList,
      first_id: runsList[0]?.id || null,
      last_id: runsList[runsList.length - 1]?.id || null,
      has_more: false,
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
