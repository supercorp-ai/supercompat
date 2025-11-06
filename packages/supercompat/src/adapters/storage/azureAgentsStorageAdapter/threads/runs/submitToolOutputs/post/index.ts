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

    // Submit tool outputs to Azure
    await azureAiProject.agents.runs.submitToolOutputs(threadId, runId, tool_outputs.map((to: any) => ({
      toolCallId: to.tool_call_id,
      output: to.output,
    })))

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
      // For non-streaming, we need to collect all events
      const events: OpenAI.Beta.AssistantStreamEvent[] = []
      let finalRun: OpenAI.Beta.Threads.Run | null = null

      await runAdapter.handleRun({
        threadId,
        onEvent: async (event) => {
          events.push(event)
          if (
            event.event === 'thread.run.completed' ||
            event.event === 'thread.run.failed' ||
            event.event === 'thread.run.requires_action'
          ) {
            finalRun = event.data
          }
        },
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
