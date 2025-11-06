import type OpenAI from 'openai'
import type { AIProjectClient } from '@azure/ai-projects'
import { uid } from 'radash'
import dayjs from 'dayjs'
import { submitToolOutputsRegexp } from '@/lib/runs/submitToolOutputsRegexp'
import { RunAdapterWithAssistant } from '@/types'

// Import the conversion function from the run adapter
// We need to extract this to a shared module
function convertAzureEventToOpenAI(
  azureEvent: any,
  assistantId: string,
): OpenAI.Beta.AssistantStreamEvent | null {
  const { event, data } = azureEvent
  const eventType = event as string

  if (eventType.startsWith('thread.run.')) {
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
        last_error: data.lastError ? { code: 'server_error', message: JSON.stringify(data.lastError) } : null,
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
        truncation_strategy: { type: 'auto', last_messages: null },
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
              text: { value: c.text?.value || '', annotations: c.text?.annotations || [] },
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
                text: { value: c.text?.value || '', annotations: c.text?.annotations || [] },
              }
            }
            return c
          }) || [],
        },
      },
    } as OpenAI.Beta.AssistantStreamEvent
  }

  return null
}

type SubmitToolOutputsResponse = Response & {
  json: () => Promise<OpenAI.Beta.Threads.Run>
}

export const post =
  ({
    azureAiProject,
    runAdapter,
  }: {
    azureAiProject: AIProjectClient
    runAdapter: RunAdapterWithAssistant
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
