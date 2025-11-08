import type OpenAI from 'openai'
import type { AIProjectClient } from '@azure/ai-projects'
import dayjs from 'dayjs'
import type { RunAdapterWithAssistant } from '@/types'
import { stepsRegexp } from '@/lib/steps/stepsRegexp'

type StepListResponse = Response & {
  json: () => Promise<OpenAI.Beta.Threads.Runs.Steps.RunStepsPage>
}

export const get =
  ({
    azureAiProject,
    runAdapter,
  }: {
    azureAiProject: AIProjectClient
    runAdapter: RunAdapterWithAssistant
  }) =>
  async (urlString: string): Promise<StepListResponse> => {
    const url = new URL(urlString)
    const [, threadId, runId] = url.pathname.match(new RegExp(stepsRegexp))!

    const azureSteps = await azureAiProject.agents.runSteps.list(threadId, runId)

    const openaiAssistant = await runAdapter.getOpenaiAssistant({
      select: { id: true },
    })

    const stepsList: OpenAI.Beta.Threads.Runs.RunStep[] = []
    for await (const step of azureSteps) {
      stepsList.push({
        id: step.id,
        object: 'thread.run.step',
        created_at: dayjs(step.createdAt).unix(),
        assistant_id: openaiAssistant.id,
        thread_id: threadId,
        run_id: runId,
        type: step.type === 'tool_calls' ? 'tool_calls' : 'message_creation',
        status: step.status as any,
        step_details:
          step.type === 'tool_calls'
            ? {
                type: 'tool_calls' as const,
                tool_calls: (step.stepDetails as any).toolCalls.map(
                  (tc: any) => {
                    if (tc.type === 'code_interpreter') {
                      return {
                        id: tc.id,
                        type: 'code_interpreter' as const,
                        code_interpreter: {
                          input: tc.codeInterpreter?.input || '',
                          outputs: tc.codeInterpreter?.outputs?.map((output: any) => {
                            if (output.type === 'logs') {
                              return {
                                type: 'logs' as const,
                                logs: output.logs || '',
                              }
                            }
                            if (output.type === 'image') {
                              return {
                                type: 'image' as const,
                                image: {
                                  file_id: output.image?.fileId || '',
                                },
                              }
                            }
                            return output
                          }) || [],
                        },
                      }
                    } else if (tc.type === 'file_search') {
                      return {
                        id: tc.id,
                        type: 'file_search' as const,
                        file_search: tc.fileSearch || {},
                      }
                    } else if (tc.type === 'function') {
                      return {
                        id: tc.id,
                        type: 'function' as const,
                        function: {
                          name: tc.function.name,
                          arguments: tc.function.arguments,
                          output: tc.function.output || null,
                        },
                      }
                    }
                    // Unknown tool type, return as-is
                    return tc
                  },
                ),
              }
            : {
                type: 'message_creation' as const,
                message_creation: {
                  message_id: (step.stepDetails as any).messageCreation
                    ?.messageId,
                },
              },
        last_error: null,
        expired_at: null,
        cancelled_at: null,
        failed_at: null,
        completed_at: step.completedAt ? dayjs(step.completedAt).unix() : null,
        metadata: step.metadata || {},
        usage: null,
      })
    }

    const response = {
      data: stepsList,
      first_id: stepsList[0]?.id || null,
      last_id: stepsList[stepsList.length - 1]?.id || null,
      has_more: false,
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
