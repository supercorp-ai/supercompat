import type OpenAI from 'openai'
import type { AIProjectClient } from '@azure/ai-projects'
import { uid } from 'radash'
import dayjs from 'dayjs'
import { runsRegexp } from '@/lib/runs/runsRegexp'
import { RunAdapterWithAssistant } from '@/types'

// Get azureAgentId from the run adapter
type AzureAgentsRunAdapter = RunAdapterWithAssistant & {
  azureAgentId?: string
}

type RunCreateResponse = Response & {
  json: () => Promise<OpenAI.Beta.Threads.Run>
}

export const post =
  ({
    azureAiProject,
    runAdapter,
    azureAgentId,
  }: {
    azureAiProject: AIProjectClient
    runAdapter: RunAdapterWithAssistant
    azureAgentId: string
  }) =>
  async (
    urlString: string,
    options: RequestInit & { body?: string },
  ): Promise<RunCreateResponse> => {
    const url = new URL(urlString)
    const [, threadId] = url.pathname.match(new RegExp(runsRegexp))!

    if (typeof options.body !== 'string') {
      throw new Error('Request body is required')
    }

    const body = JSON.parse(options.body)
    const { stream } = body

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          await runAdapter.handleRun({
            threadId,
            onEvent: async (event) => {
              controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
            },
          })
        } catch (error: any) {
          console.error(error)

          const event = {
            event: 'thread.run.failed',
            data: {
              id: uid(24),
              failed_at: dayjs().unix(),
              last_error: {
                code: 'server_error',
                message: `${error?.message ?? ''} ${error?.cause?.message ?? ''}`,
              },
            },
          }

          controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
        }

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
      // For non-streaming, just create the run and return immediately
      // The OpenAI SDK will poll for status using runs.retrieve

      // Create the run in Azure (this starts it executing)
      const azureRun = await azureAiProject.agents.runs.create(threadId, azureAgentId)

      const openaiAssistant = await runAdapter.getOpenaiAssistant({
        select: { id: true },
      })

      // Return the run object immediately with its initial status
      const runData: OpenAI.Beta.Threads.Run = {
        id: azureRun.id,
        object: 'thread.run',
        created_at: dayjs(azureRun.createdAt).unix(),
        thread_id: azureRun.threadId,
        assistant_id: openaiAssistant.id,
        status: azureRun.status as any,
        required_action: null,
        last_error: null,
        expires_at: null,
        started_at: azureRun.status === 'in_progress' ? dayjs(azureRun.createdAt).unix() : null,
        cancelled_at: null,
        failed_at: null,
        completed_at: null,
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

      return new Response(JSON.stringify(runData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    }
  }
