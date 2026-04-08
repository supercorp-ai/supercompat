import type OpenAI from 'openai'
import { uid } from 'radash'
import dayjs from 'dayjs'
import { assign } from 'radash'
import { runsRegexp } from '@/lib/runs/runsRegexp'
import { serializeResponseAsRun } from '@/lib/responses/serializeResponseAsRun'
import { RunAdapterWithAssistant } from '@/types'
import { saveResponseItemsToConversationMetadata } from '@/lib/responses/saveResponseItemsToConversationMetadata'
import { enqueueSSE } from '@/lib/sse/enqueueSSE'
import { isOpenaiComputerUseModel } from '@/lib/openaiComputerUse'
import {
  defaultAssistant,
  serializeTools,
  textConfig,
  truncation,
} from '@/handlers/assistants/responsesStorageAdapter/threads/runs/shared'

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

  const response = await client.responses.create(responseBody)

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        await runAdapter.handleRun({
          threadId,
          response,
          onEvent: async (event: any) => (
            enqueueSSE(controller, event.event, event.data)
          ),
        })
      } catch (error: any) {
        console.error(error)

        enqueueSSE(controller, 'thread.run.failed', {
          id: uid(24),
          failed_at: dayjs().unix(),
          last_error: {
            code: 'server_error',
            message: `${error?.message ?? ''} ${error?.cause?.message ?? ''}`,
          },
        })
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
    const nonStreamResponse = response as OpenAI.Responses.Response
    const itemIds = (nonStreamResponse.output ?? [])
      .filter((o: OpenAI.Responses.ResponseOutputItem) => o.id)
      .map((o: OpenAI.Responses.ResponseOutputItem) => o.id!)

    if (itemIds.length > 0) {
      await saveResponseItemsToConversationMetadata({
        client,
        threadId,
        responseId: nonStreamResponse.id,
        itemIds,
      })
    }

    const data = serializeResponseAsRun({
      response: nonStreamResponse,
      assistantId: assistant_id,
    })

    return new Response(JSON.stringify(
      data
    ), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
}
