import type OpenAI from 'openai'
import type { AIProjectClient } from '@azure/ai-projects'
import type { PrismaClient } from '@prisma/client'
import { uid } from 'radash'
import dayjs from 'dayjs'
import { submitToolOutputsRegexp } from '@/lib/runs/submitToolOutputsRegexp'
import { RunAdapterWithAssistant } from '@/types'

// Complete conversion function from run adapter
// This handles ALL event types including thread.run.step.* events
function convertAzureEventToOpenAI(
  azureEvent: any,
  assistantId: string,
): OpenAI.Beta.AssistantStreamEvent | null {
  const { event, data } = azureEvent
  const eventType = event as string

  // IMPORTANT: Exclude step events from the general run handler, they have their own handler below
  if (eventType.startsWith('thread.run.') && !eventType.startsWith('thread.run.step.')) {
    return {
      event: eventType as any,
      data: {
        id: data.id,
        object: 'thread.run',
        created_at: dayjs(data.createdAt).unix(),
        thread_id: data.threadId,
        assistant_id: assistantId,
        status: data.status,
        required_action: data.requiredAction
          ? {
              type: 'submit_tool_outputs',
              submit_tool_outputs: {
                tool_calls: (data.requiredAction as any).submitToolOutputs?.toolCalls?.map(
                  (tc: any) => ({
                    id: tc.id,
                    type: 'function' as const,
                    function: {
                      name: tc.function.name,
                      arguments: tc.function.arguments,
                    },
                  }),
                ) || [],
              },
            }
          : null,
        last_error: data.lastError
          ? {
              code: 'server_error',
              message: JSON.stringify(data.lastError),
            }
          : null,
        expires_at: null,
        started_at: data.startedAt ? dayjs(data.startedAt).unix() : null,
        cancelled_at: data.cancelledAt ? dayjs(data.cancelledAt).unix() : null,
        failed_at: data.failedAt ? dayjs(data.failedAt).unix() : null,
        completed_at: data.completedAt ? dayjs(data.completedAt).unix() : null,
        incomplete_details: null,
        model: data.model || '',
        instructions: data.instructions || '',
        tools: data.tools || [],
        metadata: data.metadata || {},
        temperature: data.temperature ?? null,
        top_p: data.topP ?? null,
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
      } as OpenAI.Beta.Threads.Run,
    } as OpenAI.Beta.AssistantStreamEvent
  }

  if (eventType.startsWith('thread.message.') && eventType !== 'thread.message.delta') {
    return {
      event: eventType as any,
      data: {
        id: data.id,
        object: 'thread.message',
        created_at: dayjs(data.createdAt).unix(),
        thread_id: data.threadId,
        role: data.role,
        content: data.content?.map((c: any) => {
          if (c.type === 'text') {
            return {
              type: 'text',
              text: {
                value: c.text?.value || '',
                annotations: c.text?.annotations || [],
              },
            }
          }
          return c
        }) || [],
        assistant_id: assistantId,
        run_id: data.runId || null,
        attachments: data.attachments || [],
        metadata: data.metadata || {},
        status: data.status || 'completed',
        completed_at: data.completedAt ? dayjs(data.completedAt).unix() : null,
        incomplete_at: null,
        incomplete_details: null,
      } as OpenAI.Beta.Threads.Message,
    } as OpenAI.Beta.AssistantStreamEvent
  }

  if (eventType === 'thread.message.delta') {
    return {
      event: 'thread.message.delta' as any,
      data: {
        id: data.id,
        object: 'thread.message.delta',
        delta: {
          content: data.delta?.content?.map((c: any) => {
            if (c.type === 'text') {
              return {
                index: c.index || 0,
                type: 'text',
                text: {
                  value: c.text?.value || '',
                  annotations: c.text?.annotations || [],
                },
              }
            }
            return c
          }) || [],
        },
      },
    } as OpenAI.Beta.AssistantStreamEvent
  }

  if (eventType === 'thread.run.step.delta') {
    // Handle run step delta events separately - they have delta.stepDetails
    // Skip delta events where stepDetails is missing or has no type - these are incomplete
    if (!data.delta?.stepDetails || !data.delta.stepDetails.type) {
      return null
    }

    let stepDetailsDelta: any = undefined

    if (data.delta?.stepDetails) {
      const details = data.delta.stepDetails
      if (details.type === 'tool_calls') {
        stepDetailsDelta = {
          type: 'tool_calls',
          tool_calls: details.toolCalls?.map((tc: any) => {
            if (tc.type === 'code_interpreter') {
              return {
                index: tc.index ?? 0,
                id: tc.id,
                type: 'code_interpreter',
                code_interpreter: {
                  input: tc.codeInterpreter?.input || '',
                  outputs: tc.codeInterpreter?.outputs?.map((output: any) => {
                    if (output.type === 'logs') {
                      return {
                        index: output.index ?? 0,
                        type: 'logs',
                        logs: output.logs || '',
                      }
                    }
                    if (output.type === 'image') {
                      return {
                        index: output.index ?? 0,
                        type: 'image',
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
                index: tc.index ?? 0,
                id: tc.id,
                type: 'file_search',
                file_search: tc.fileSearch || {},
              }
            } else if (tc.type === 'function') {
              return {
                index: tc.index ?? 0,
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.function?.name || '',
                  arguments: tc.function?.arguments || '',
                  output: tc.function?.output || null,
                },
              }
            }
            return tc
          }) || [],
        }
      } else {
        stepDetailsDelta = details
      }
    }

    // Final safety check: if stepDetailsDelta is still undefined after processing, skip this event
    if (stepDetailsDelta === undefined) {
      return null
    }

    return {
      event: 'thread.run.step.delta' as any,
      data: {
        id: data.id,
        object: 'thread.run.step.delta',
        delta: {
          step_details: stepDetailsDelta,
        },
      },
    } as OpenAI.Beta.AssistantStreamEvent
  }

  if (eventType.startsWith('thread.run.step.')) {
    // Convert RunStep events with proper snake_case transformation
    // Skip events where stepDetails is missing, has no type, or where the step type is undefined
    // Azure sometimes sends incomplete step events during file_search initialization
    if (!data.stepDetails || !data.stepDetails.type || !data.type) {
      return null
    }

    let stepDetails: any = undefined

    if (data.stepDetails) {
      if (data.stepDetails.type === 'message_creation') {
        stepDetails = {
          type: 'message_creation',
          message_creation: {
            message_id: data.stepDetails.messageCreation?.messageId || '',
          },
        }
      } else if (data.stepDetails.type === 'tool_calls') {
        stepDetails = {
          type: 'tool_calls',
          tool_calls: data.stepDetails.toolCalls?.map((tc: any) => {
            if (tc.type === 'code_interpreter') {
              return {
                id: tc.id,
                type: 'code_interpreter',
                code_interpreter: {
                  input: tc.codeInterpreter?.input || '',
                  outputs: tc.codeInterpreter?.outputs?.map((output: any) => {
                    if (output.type === 'logs') {
                      return {
                        type: 'logs',
                        logs: output.logs || '',
                      }
                    }
                    if (output.type === 'image') {
                      return {
                        type: 'image',
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
                type: 'file_search',
                file_search: tc.fileSearch || {},
              }
            } else if (tc.type === 'function') {
              return {
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.function?.name || '',
                  arguments: tc.function?.arguments || '',
                  output: tc.function?.output || null,
                },
              }
            }
            return tc
          }) || [],
        }
      } else {
        // Unknown type, pass through
        stepDetails = data.stepDetails
      }
    }

    // Final safety check: if stepDetails is still undefined after processing, skip this event
    // This prevents OpenAI SDK from crashing on incomplete events
    if (stepDetails === undefined) {
      return null
    }

    return {
      event: eventType as any,
      data: {
        id: data.id,
        object: 'thread.run.step',
        created_at: dayjs(data.createdAt).unix(),
        assistant_id: assistantId,
        thread_id: data.threadId,
        run_id: data.runId,
        type: data.type,
        status: data.status,
        step_details: stepDetails,
        last_error: data.lastError || null,
        expired_at: null,
        cancelled_at: data.cancelledAt ? dayjs(data.cancelledAt).unix() : null,
        failed_at: data.failedAt ? dayjs(data.failedAt).unix() : null,
        completed_at: data.completedAt ? dayjs(data.completedAt).unix() : null,
        metadata: data.metadata || {},
        usage: null,
      } as OpenAI.Beta.Threads.Runs.RunStep,
    } as OpenAI.Beta.AssistantStreamEvent
  }

  if (eventType === 'thread.created') {
    return {
      event: 'thread.created' as any,
      data: {
        id: data.id,
        object: 'thread',
        created_at: dayjs(data.createdAt).unix(),
        metadata: data.metadata || {},
        tool_resources: data.toolResources || null,
      } as OpenAI.Beta.Threads.Thread,
    } as OpenAI.Beta.AssistantStreamEvent
  }

  // Return null for unhandled event types
  return null
}

type SubmitToolOutputsResponse = Response & {
  json: () => Promise<OpenAI.Beta.Threads.Run>
}

export const post =
  ({
    azureAiProject,
    runAdapter,
    prisma,
  }: {
    azureAiProject: AIProjectClient
    runAdapter: RunAdapterWithAssistant
    prisma: PrismaClient
  }) =>
  async (
    urlString: string,
    options: RequestInit & { body?: string },
  ): Promise<SubmitToolOutputsResponse> => {
    const url = new URL(urlString)
    const [, threadId, runId] = url.pathname.match(
      new RegExp(submitToolOutputsRegexp),
    )!

    if (typeof options.body !== 'string') {
      throw new Error('Request body is required')
    }

    const body = JSON.parse(options.body)
    const { tool_outputs, stream } = body

    // Store function tool outputs in database for later retrieval
    // since Azure API doesn't persist them
    await Promise.all(
      tool_outputs.map((output: { tool_call_id: string; output: string }) =>
        prisma.azureAgentsFunctionOutput.upsert({
          where: {
            runId_toolCallId: {
              runId,
              toolCallId: output.tool_call_id,
            },
          },
          create: {
            runId,
            toolCallId: output.tool_call_id,
            output: output.output,
          },
          update: {
            output: output.output,
          },
        })
      )
    )

    // Get the existing run to find the assistant_id (agent ID)
    const existingRun = await azureAiProject.agents.runs.get(threadId, runId)
    const assistantId = existingRun.assistantId

    // Submit tool outputs to Azure with streaming support
    const submitResponse = azureAiProject.agents.runs.submitToolOutputs(
      threadId,
      runId,
      tool_outputs.map((to: any) => ({
        toolCallId: to.tool_call_id,
        output: to.output,
      })),
    )

    // After submitting tool outputs, stream the results
    const streamRun = async (onEvent: (event: OpenAI.Beta.AssistantStreamEvent) => Promise<void>) => {
      try {
        // Start streaming the results
        const stream = await submitResponse.stream()

        // Convert Azure events to OpenAI events and emit them
        for await (const azureEvent of stream) {
          const openaiEvent = convertAzureEventToOpenAI(azureEvent, assistantId)
          if (openaiEvent) {
            await onEvent(openaiEvent)
          }
        }
      } catch (error: any) {
        await onEvent({
          event: 'thread.run.failed',
          data: {
            id: runId,
            object: 'thread.run',
            created_at: dayjs().unix(),
            thread_id: threadId,
            assistant_id: assistantId,
            status: 'failed',
            required_action: null,
            last_error: {
              code: 'server_error',
              message: `${error?.message ?? ''} ${error?.cause?.message ?? ''}`,
            },
            expires_at: null,
            started_at: dayjs().unix(),
            cancelled_at: null,
            failed_at: dayjs().unix(),
            completed_at: null,
            incomplete_details: null,
            model: '',
            instructions: '',
            tools: [],
            metadata: {},
            temperature: null,
            top_p: null,
            max_prompt_tokens: null,
            max_completion_tokens: null,
            truncation_strategy: { type: 'auto', last_messages: null },
            response_format: 'auto',
            tool_choice: 'auto',
            parallel_tool_calls: true,
            usage: null,
          } as OpenAI.Beta.Threads.Run,
        })
      }
    }

    const readableStream = new ReadableStream({
      async start(controller) {
        await streamRun(async (event) => {
          controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
        })
        controller.close()
      },
    })

    if (stream) {
      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/event-stream',
        },
      })
    } else {
      // For non-streaming, we need to collect all events
      const events: OpenAI.Beta.AssistantStreamEvent[] = []
      let finalRun: OpenAI.Beta.Threads.Run | null = null

      await streamRun(async (event) => {
        events.push(event)
        if (
          event.event === 'thread.run.completed' ||
          event.event === 'thread.run.failed' ||
          event.event === 'thread.run.requires_action'
        ) {
          finalRun = event.data
        }
      })

      if (!finalRun) {
        throw new Error('Run did not complete')
      }

      return new Response(JSON.stringify(finalRun), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    }
  }
