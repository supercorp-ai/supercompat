import type OpenAI from 'openai'
import type { AIProjectClient } from '@azure/ai-projects'
import type { PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'
import type { RequestHandler } from '@/types'
import { stepRegexp } from '@/openaiAssistants/lib/steps/stepRegexp'

export const get = ({
  azureAiProject,
  prisma,
}: {
  azureAiProject: AIProjectClient
  prisma: PrismaClient
}): RequestHandler => async (urlString: string) => {
  const url = new URL(urlString)
  const [, threadId, runId, stepId] = url.pathname.match(new RegExp(stepRegexp))!

  const step = await azureAiProject.agents.runSteps.get(threadId, runId, stepId)

  // Retrieve stored function outputs for this run
  const storedOutputs = await prisma.azureAgentsFunctionOutput.findMany({
    where: { runId },
  })

  const outputsMap = new Map(
    storedOutputs.map((o) => [o.toolCallId, o.output])
  )

  const assistantId = (step as any).assistantId || (step as any).assistant_id || ''

  const openaiStep: OpenAI.Beta.Threads.Runs.RunStep = {
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
                      output: tc.function.output ?? outputsMap.get(tc.id) ?? null,
                    },
                  }
                }
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
  }

  return new Response(JSON.stringify(openaiStep), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
