import type { OpenAI } from 'openai'
import type { RunAdapterWithAssistant } from '@/types'
import { submitToolOutputsRegexp } from '@/lib/runs/submitToolOutputsRegexp'
import { serializeItemAsFunctionCallRunStep } from '@/lib/items/serializeItemAsFunctionCallRunStep'
import { serializeItemAsComputerCallRunStep } from '@/lib/items/serializeItemAsComputerCallRunStep'
import { isOpenaiComputerUseModel } from '@/lib/openaiComputerUse'
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

  console.log(`[submitToolOutputs] Sending to OpenAI:`, JSON.stringify({ input: responseBody.input, tools: responseBody.tools }).slice(0, 500))
  const response = await client.responses.create(responseBody)

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

        controller.enqueue(`event: thread.run.step.completed\ndata: ${JSON.stringify(serializeItemAsFunctionCallRunStep({
            item: toolCallItem,
            items: toolCallOutputItems.functionCallOutputItems,
            threadId,
            openaiAssistant,
            runId,
          }))}\n\n`)
      })

      toolCallOutputItems.computerCallOutputItems.forEach((item) => {
        const toolCallItem = previousResponse.output.find((i) => (
          i.type === 'computer_call' &&
            i.call_id === item.call_id
        )) as OpenAI.Responses.ResponseComputerToolCall | undefined

        if (!toolCallItem) {
          return
        }

        controller.enqueue(`event: thread.run.step.completed\ndata: ${JSON.stringify(serializeItemAsComputerCallRunStep({
            item: toolCallItem,
            items: toolCallOutputItems.computerCallOutputItems,
            threadId,
            openaiAssistant,
            runId,
          }))}\n\n`)
      })

      await runAdapter.handleRun({
        threadId,
        response,
        onEvent: async (event: any) => (
          controller.enqueue(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`)
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
