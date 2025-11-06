import type OpenAI from 'openai'
import type { AIProjectClient } from '@azure/ai-projects'
import { uid } from 'radash'
import dayjs from 'dayjs'
import { submitToolOutputsRegexp } from '@/lib/runs/submitToolOutputsRegexp'
import { RunAdapterWithAssistant } from '@/types'

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

    // Submit tool outputs to Azure
    await azureAiProject.agents.runs.submitToolOutputs(threadId, runId, tool_outputs.map((to: any) => ({
      toolCallId: to.tool_call_id,
      output: to.output,
    })))

    // After submitting tool outputs, poll the existing run until it completes
    const pollRun = async (onEvent: (event: OpenAI.Beta.AssistantStreamEvent) => Promise<void>) => {
      try {
        // Emit run in progress event
        await onEvent({
          event: 'thread.run.in_progress',
          data: {
            id: runId,
            object: 'thread.run',
            created_at: dayjs().unix(),
            thread_id: threadId,
            assistant_id: assistantId,
            status: 'in_progress',
            required_action: null,
            last_error: null,
            expires_at: null,
            started_at: dayjs().unix(),
            cancelled_at: null,
            failed_at: null,
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

        // Poll the run until it reaches a terminal status
        let azureRun = await azureAiProject.agents.runs.get(threadId, runId)
        while (azureRun.status === 'queued' || azureRun.status === 'in_progress') {
          await new Promise((resolve) => setTimeout(resolve, 1000))
          azureRun = await azureAiProject.agents.runs.get(threadId, runId)
        }

        if (azureRun.status === 'completed') {
          // Get messages from this run
          const runStartTime = dayjs(existingRun.createdAt)
          const messages = await azureAiProject.agents.messages.list(threadId, { order: 'asc' })

          for await (const message of messages) {
            const messageTime = dayjs(message.createdAt)
            if (
              message.role === 'assistant' &&
              messageTime.isAfter(runStartTime)
            ) {
              const textContent = message.content.find((c: any) => c.type === 'text')
              if (textContent && 'text' in textContent) {
                await onEvent({
                  event: 'thread.message.created',
                  data: {
                    id: message.id,
                    object: 'thread.message',
                    created_at: dayjs(message.createdAt).unix(),
                    thread_id: message.threadId,
                    role: 'assistant',
                    content: [{ type: 'text', text: { value: textContent.text.value, annotations: [] } }],
                    assistant_id: assistantId,
                    run_id: runId,
                    attachments: [],
                    metadata: {},
                    status: 'completed',
                    completed_at: dayjs().unix(),
                    incomplete_at: null,
                    incomplete_details: null,
                  } as OpenAI.Beta.Threads.Message,
                })
              }
            }
          }

          await onEvent({
            event: 'thread.run.completed',
            data: {
              id: runId,
              object: 'thread.run',
              created_at: dayjs(azureRun.createdAt).unix(),
              thread_id: threadId,
              assistant_id: assistantId,
              status: 'completed',
              required_action: null,
              last_error: null,
              expires_at: null,
              started_at: dayjs(azureRun.createdAt).unix(),
              cancelled_at: null,
              failed_at: null,
              completed_at: dayjs().unix(),
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
        await pollRun(async (event) => {
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

      await pollRun(async (event) => {
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
