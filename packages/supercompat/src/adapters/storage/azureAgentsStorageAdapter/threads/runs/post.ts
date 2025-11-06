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
  }: {
    azureAiProject: AIProjectClient
    runAdapter: RunAdapterWithAssistant
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
    const { assistant_id, stream, instructions, tools } = body

    if (!assistant_id) {
      throw new Error('assistant_id is required')
    }

    // assistant_id from OpenAI API maps to azureAgentId
    const azureAgentId = assistant_id

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          await runAdapter.handleRun({
            threadId,
            assistantId: azureAgentId,
            instructions,
            tools,
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
      // Retry with exponential backoff if thread already has active run
      let azureRun
      let retries = 0
      const maxRetries = 10

      while (retries < maxRetries) {
        try {
          // Build the options object for Azure run creation
          const createOptions: any = {}
          if (instructions) {
            createOptions.instructions = instructions
          }
          if (tools) {
            createOptions.tools = tools
          }

          azureRun = await azureAiProject.agents.runs.create(
            threadId,
            azureAgentId,
            createOptions,
          )
          break // Success, exit retry loop
        } catch (error: any) {
          const errorMessage = error?.message || error?.cause?.message || ''

          if (errorMessage.includes('already has an active run')) {
            // Extract the run ID from error message if possible
            const runIdMatch = errorMessage.match(/run_[a-zA-Z0-9]+/)

            if (runIdMatch) {
              const activeRunId = runIdMatch[0]
              // Wait for the active run to complete
              let activeRun = await azureAiProject.agents.runs.get(threadId, activeRunId)

              while (activeRun.status === 'queued' || activeRun.status === 'in_progress') {
                await new Promise((resolve) => setTimeout(resolve, 500))
                activeRun = await azureAiProject.agents.runs.get(threadId, activeRunId)
              }
            } else {
              // Can't determine run ID, just wait and retry
              await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, retries)))
            }

            retries++
          } else {
            // Different error, throw it
            throw error
          }
        }
      }

      if (!azureRun) {
        throw new Error(`Failed to create run after ${maxRetries} retries`)
      }

      // Return the run object immediately with its initial status
      const runData: OpenAI.Beta.Threads.Run = {
        id: azureRun.id,
        object: 'thread.run',
        created_at: dayjs(azureRun.createdAt).unix(),
        thread_id: azureRun.threadId,
        assistant_id: azureAgentId,
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
