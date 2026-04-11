import type OpenAI from 'openai'
import { uid } from 'radash'
import dayjs from 'dayjs'
import { assign } from 'radash'
import { runsRegexp } from '@/lib/runs/runsRegexp'
import { RunAdapterWithAssistant } from '@/types'
import { enqueueSSE } from '@/lib/sse/enqueueSSE'
import { isOpenaiComputerUseModel } from '@/lib/openaiComputerUse'
import { createResponseToAssistantEventTranslator } from '@/lib/responses/createResponseToAssistantEventTranslator'
import {
  defaultAssistant,
  serializeTools,
  textConfig,
  truncation,
} from '@/handlers/assistants/openaiResponsesStorageAdapter/threads/runs/shared'

type RunCreateResponse = Response & {
  json: () => Promise<OpenAI.Beta.Threads.Run>
}

export const post = ({
  client,
  runAdapter,
  createResponseItems,
}: {
  client: OpenAI
  runAdapter: RunAdapterWithAssistant
  createResponseItems: OpenAI.Responses.ResponseInputItem[]
}) => async (urlString: string, options: RequestInit & { body?: string }): Promise<RunCreateResponse> => {
  const url = new URL(urlString)
  const [, threadId] = url.pathname.match(new RegExp(runsRegexp))!

  if (typeof options.body !== 'string') {
    throw new Error('Request body is required')
  }

  const body = JSON.parse(options.body)
  const {
    assistant_id,
    stream,
  } = body

  const assistantId = typeof assistant_id === 'string' ? assistant_id.trim() : ''
  const openaiAssistant = await runAdapter.getOpenaiAssistant()

  const {
    model,
    instructions,
    // additional_instructions,
    tools,
    metadata,
    response_format,
    truncation_strategy,
  } = assign({
    ...defaultAssistant,
    ...openaiAssistant,
  }, body)

  const azureAgentId = (
    openaiAssistant &&
    typeof openaiAssistant === 'object' &&
    typeof openaiAssistant.id === 'string' &&
    typeof openaiAssistant.name === 'string' &&
    openaiAssistant.id.trim().length > 0 &&
    openaiAssistant.id === openaiAssistant.name &&
    openaiAssistant.id === assistantId
  ) ? openaiAssistant.id : undefined
  const shouldSendInstructions = !azureAgentId &&
    typeof instructions === 'string' &&
    instructions.trim().length > 0

  const responseBody: OpenAI.Responses.ResponseCreateParams & {
    agent?: {
      name: string
      type: 'agent_reference'
    }
  } = {
    conversation: threadId,
    stream,
    input: [...createResponseItems],
  }

  // Clear deferred items so subsequent runs in this thread don't re-send them
  createResponseItems.length = 0

  if (azureAgentId) {
    responseBody.agent = {
      name: azureAgentId,
      type: 'agent_reference',
    }
  }

  if (!azureAgentId) {
    responseBody.model = model
    if (metadata && typeof metadata === 'object') {
      responseBody.metadata = metadata
    }

    Object.assign(responseBody, serializeTools({
      tools,
      useOpenaiComputerTool: isOpenaiComputerUseModel({ model }),
      toolResources: openaiAssistant.tool_resources,
    }))
    responseBody.truncation = truncation({ truncation_strategy })

    const normalizedText = textConfig({ response_format })
    if (normalizedText) {
      responseBody.text = normalizedText
    }
  } else if (metadata && Object.keys(metadata).length > 0) {
    responseBody.metadata = metadata
  }

  if (shouldSendInstructions && typeof instructions === 'string') {
    responseBody.instructions = instructions
  }

  let completedRunData: OpenAI.Beta.Threads.Run | null = null

  const readableStream = new ReadableStream({
    async start(controller) {
      const translator = createResponseToAssistantEventTranslator({
        getOpenaiAssistant: runAdapter.getOpenaiAssistant,
        threadId,
        client,
        onEvent: async (event: OpenAI.Beta.AssistantStreamEvent) => {
          if (event.event === 'thread.run.completed' || event.event === 'thread.run.requires_action' || event.event === 'thread.run.failed') {
            completedRunData = event.data as OpenAI.Beta.Threads.Run
          }
          enqueueSSE(controller, event.event, event.data)
        },
      })

      try {
        await runAdapter.handleRun({
          body: responseBody,
          onEvent: async (event: any) => {
            await translator.handleEvent(event)
          },
        })
        await translator.finalize()
      } catch (error: any) {
        console.error(error)
        await translator.handleError(error)
      } finally {
        translator.cleanup()
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
    // Consume the stream to trigger the run adapter
    const reader = readableStream.getReader()
    while (true) {
      const { done } = await reader.read()
      if (done) break
    }

    if (!completedRunData) {
      return new Response(JSON.stringify({ error: { message: 'Run failed to produce a result', type: 'server_error' } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(completedRunData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
