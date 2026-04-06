import type { OpenAI } from 'openai'
import type { RunAdapterWithAssistant } from '@/types'
import { submitToolOutputsRegexp } from '@/openaiAssistants/lib/runs/submitToolOutputsRegexp'
import { serializeItemAsFunctionCallRunStep } from '@/openaiAssistants/lib/items/serializeItemAsFunctionCallRunStep'
import { serializeItemAsComputerCallRunStep } from '@/openaiAssistants/lib/items/serializeItemAsComputerCallRunStep'
import { isOpenaiComputerUseModel } from '@/lib/openaiComputerUse'
import { enqueueSSE } from '@/openaiAssistants/lib/sse/enqueueSSE'
import { serializeResponseAsRun } from '@/openaiAssistants/lib/responses/serializeResponseAsRun'
import { saveResponseItemsToConversationMetadata } from '@/openaiAssistants/lib/responses/saveResponseItemsToConversationMetadata'
import { getToolCallOutputItems, serializeTools, truncation } from '../shared'

export const post = ({
  client,
  runAdapter,
}: {
  client: OpenAI
  runAdapter: RunAdapterWithAssistant
}) => async (urlString: string, options: any) => {
  const url = new URL(urlString)
  const [, threadId, runId] = url.pathname.match(new RegExp(submitToolOutputsRegexp))!

  const body = JSON.parse(options.body)

  const {
    tool_outputs,
    stream,
  } = body

  const toolCallOutputItems = getToolCallOutputItems({ tool_outputs })
  const input = [...toolCallOutputItems.functionCallOutputItems, ...toolCallOutputItems.computerCallOutputItems]

  const previousResponse = await client.responses.retrieve(runId)

  const openaiAssistant = await runAdapter.getOpenaiAssistant()

  const shouldSendInstructions = typeof openaiAssistant.instructions === 'string' &&
    openaiAssistant.instructions.trim().length > 0

  const responseBody: OpenAI.Responses.ResponseCreateParams = {
    conversation: threadId,
    stream,
    input,
  }

  responseBody.model = openaiAssistant.model
  Object.assign(responseBody, serializeTools({
    tools: openaiAssistant.tools,
    useOpenaiComputerTool: isOpenaiComputerUseModel({
      model: openaiAssistant.model,
    }),
  }))
  responseBody.truncation = truncation({ openaiAssistant })

  if (shouldSendInstructions && typeof openaiAssistant.instructions === 'string') {
    responseBody.instructions = openaiAssistant.instructions
  }

  const response = await client.responses.create(responseBody)

  // Non-streaming: return the Run as JSON (used by submitToolOutputsAndPoll)
  if (!stream) {
    const completedResponse = response as OpenAI.Responses.Response

    // Save response items to conversation metadata so messages.list can resolve run_id
    const itemIds = (completedResponse.output ?? [])
      .filter((o: any) => o.id)
      .map((o: any) => o.id!)
    if (itemIds.length > 0) {
      // Use the original runId so messages.list resolves run_id to the original run
      await saveResponseItemsToConversationMetadata({
        client,
        threadId,
        responseId: runId,
        itemIds,
      })
    }

    const run = serializeResponseAsRun({
      response: completedResponse,
      assistantId: openaiAssistant.id,
    })

    // Preserve the original run ID — in the Assistants API, the run ID is stable
    // across the tool call cycle. submitToolOutputs continues the same run.
    return new Response(JSON.stringify({ ...run, id: runId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Streaming: return SSE events
  const readableStream = new ReadableStream({
    async start(controller) {
      toolCallOutputItems.functionCallOutputItems.forEach((item) => {
        const toolCallItem = previousResponse.output.find((i) => (
          i.type === 'function_call' &&
            i.call_id === item.call_id
        )) as OpenAI.Responses.ResponseFunctionToolCall | undefined

        if (!toolCallItem) {
          return
        }

        enqueueSSE(controller, 'thread.run.step.completed', serializeItemAsFunctionCallRunStep({
            item: toolCallItem,
            items: toolCallOutputItems.functionCallOutputItems,
            threadId,
            openaiAssistant,
            runId,
          }))
      })

      toolCallOutputItems.computerCallOutputItems.forEach((item) => {
        const toolCallItem = previousResponse.output.find((i) => (
          i.type === 'computer_call' &&
            i.call_id === item.call_id
        )) as OpenAI.Responses.ResponseComputerToolCall | undefined

        if (!toolCallItem) {
          return
        }

        enqueueSSE(controller, 'thread.run.step.completed', serializeItemAsComputerCallRunStep({
          item: toolCallItem,
          items: toolCallOutputItems.computerCallOutputItems,
          threadId,
          openaiAssistant,
          runId,
        }))
      })

      await runAdapter.handleRun({
        threadId,
        response,
        onEvent: async (event: any) => (
          enqueueSSE(controller, event.event, event.data)
        ),
      })

      controller.close()
    },
  })

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
    },
  })
}
