import type OpenAI from 'openai'
import type { AIProjectClient } from '@azure/ai-projects'
import dayjs from 'dayjs'
import type { RunAdapterWithAssistant } from '@/types'
import { runRegexp } from '@/lib/runs/runRegexp'

type RunGetResponse = Response & {
  json: () => Promise<OpenAI.Beta.Threads.Run>
}

export const get =
  ({
    azureAiProject,
    runAdapter,
  }: {
    azureAiProject: AIProjectClient
    runAdapter: RunAdapterWithAssistant
  }) =>
  async (urlString: string): Promise<RunGetResponse> => {
    const url = new URL(urlString)
    const [, threadId, runId] = url.pathname.match(new RegExp(runRegexp))!

    const azureRun = await azureAiProject.agents.runs.get(threadId, runId)

    // Get assistant ID from the Azure run
    const assistantId = azureRun.assistantId

    const openaiRun: OpenAI.Beta.Threads.Run = {
      id: azureRun.id,
      object: 'thread.run',
      created_at: dayjs(azureRun.createdAt).unix(),
      thread_id: azureRun.threadId,
      assistant_id: assistantId,
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
      completed_at: azureRun.status === 'completed' ? dayjs().unix() : null,
      incomplete_details: null,
      model: '',
      instructions: '',
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
      usage: null,
    }

    return new Response(JSON.stringify(openaiRun), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
