import type { OpenAI } from 'openai'
import type { RunAdapterWithAssistant } from '@/types'
import { submitToolOutputsRegexp } from '@/lib/runs/submitToolOutputsRegexp'
import { serializeItemAsFunctionCallRunStep } from '@/lib/items/serializeItemAsFunctionCallRunStep'
import { serializeItemAsComputerCallRunStep } from '@/lib/items/serializeItemAsComputerCallRunStep'
import { isOpenaiComputerUseModel } from '@/lib/openaiComputerUse'
import { enqueueSSE } from '@/lib/sse/enqueueSSE'
import { serializeResponseAsRun } from '@/lib/responses/serializeResponseAsRun'
import { getToolCallOutputItems, serializeTools, truncation } from '@/adapters/storage/responsesStorageAdapter/threads/runs/submitToolOutputs/shared'

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
  const azureAgentId = (
    openaiAssistant &&
    typeof openaiAssistant === 'object' &&
    typeof openaiAssistant.id === 'string' &&
    typeof openaiAssistant.name === 'string' &&
    openaiAssistant.id.trim().length > 0 &&
    openaiAssistant.id === openaiAssistant.name
  ) ? openaiAssistant.id : undefined

  const shouldSendInstructions = !azureAgentId &&
    typeof openaiAssistant.instructions === 'string' &&
    openaiAssistant.instructions.trim().length > 0

  const responseBody: OpenAI.Responses.ResponseCreateParams & {
    agent?: {
      name: string
      type: 'agent_reference'
    }
  } = {
    conversation: threadId,
    stream,
    input,
  }

  if (azureAgentId) {
    responseBody.agent = {
      name: azureAgentId,
      type: 'agent_reference',
    }
  }

  if (!azureAgentId) {
    responseBody.model = openaiAssistant.model
    Object.assign(responseBody, serializeTools({
      tools: openaiAssistant.tools,
      useOpenaiComputerTool: isOpenaiComputerUseModel({
        model: openaiAssistant.model,
      }),
    }))
    responseBody.truncation = truncation({ openaiAssistant })
  }

  if (shouldSendInstructions && typeof openaiAssistant.instructions === 'string') {
    responseBody.instructions = openaiAssistant.instructions
  }

  const response = await client.responses.create(responseBody)

  // Non-streaming: return the Run as JSON (used by submitToolOutputsAndPoll)
  if (!stream) {
    const completedResponse = response as OpenAI.Responses.Response

    const run = serializeResponseAsRun({
      response: completedResponse,
      assistantId: openaiAssistant.id,
    })

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
