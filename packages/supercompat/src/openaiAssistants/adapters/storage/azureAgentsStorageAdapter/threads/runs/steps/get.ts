import type OpenAI from 'openai'
import type { AIProjectClient } from '@azure/ai-projects'
import type { PrismaClient } from '@prisma/client'
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
    prisma,
  }: {
    azureAiProject: AIProjectClient
    runAdapter: RunAdapterWithAssistant
    prisma: PrismaClient
  }) =>
  async (urlString: string): Promise<StepListResponse> => {
    const url = new URL(urlString)
    const [, threadId, runId] = url.pathname.match(new RegExp(stepsRegexp))!

    const azureSteps = await azureAiProject.agents.runSteps.list(threadId, runId)

    // Retrieve all stored function outputs for this run in a single query
    const storedOutputs = await prisma.azureAgentsFunctionOutput.findMany({
      where: { runId },
    })

    // Create a lookup map for efficient retrieval: toolCallId -> output
    const outputsMap = new Map(
      storedOutputs.map((o) => [o.toolCallId, o.output])
    )

    const stepsList: OpenAI.Beta.Threads.Runs.RunStep[] = []
    for await (const step of azureSteps) {
      // Use assistantId from the Azure step response
      // Azure docs show RunStep includes assistantId field
      const assistantId = (step as any).assistantId || (step as any).assistant_id || ''

      stepsList.push({
        id: step.id,
        object: 'thread.run.step',
        created_at: dayjs(step.createdAt).unix(),
        assistant_id: assistantId,
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
                          // Retrieve output from database if Azure doesn't provide it
                          // Use nullish coalescing (??) to preserve empty strings
                          output: tc.function.output ?? outputsMap.get(tc.id) ?? null,
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
