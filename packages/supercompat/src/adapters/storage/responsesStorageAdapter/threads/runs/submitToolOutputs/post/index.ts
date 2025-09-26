import type { OpenAI } from 'openai'
import type { RunAdapterWithAssistant } from '@/types'
import { submitToolOutputsRegexp } from '@/lib/runs/submitToolOutputsRegexp'
import { serializeItemAsFunctionCallRunStep } from '@/lib/items/serializeItemAsFunctionCallRunStep'
import { serializeItemAsComputerCallRunStep } from '@/lib/items/serializeItemAsComputerCallRunStep'

const serializeTools = ({
  tools,
}: {
  tools: OpenAI.Beta.Threads.Runs.RunCreateParams['tools']
}) => {
  if (!tools?.length) return {}

  return {
    tools: tools.map((tool) => ({
      type: tool.type,
      // @ts-ignore-next-line
      ...(tool[tool.type] || {}),
    }))
  }
}

const computerCallOutput = ({
  toolOutput,
}: {
  toolOutput: OpenAI.Beta.Threads.RunSubmitToolOutputsParams['tool_outputs'][number]
}) => {
  if (typeof toolOutput.output !== 'string') return { isComputerCallOutput: false }

  let parsedOutput

  try {
    parsedOutput = JSON.parse(toolOutput.output)
  } catch {
    return { isComputerCallOutput: false }
  }

  if (typeof parsedOutput !== 'object' || parsedOutput === null) return { isComputerCallOutput: false }
  if (parsedOutput.type !== 'computer_screenshot') return { isComputerCallOutput: false }

  return {
    isComputerCallOutput: true,
    parsedOutput,
  }
}

const getToolCallOutputItems = ({
  tool_outputs,
}: {
  tool_outputs: OpenAI.Beta.Threads.RunSubmitToolOutputsParams['tool_outputs']
}) => {
  const functionCallOutputItems: Omit<OpenAI.Responses.ResponseFunctionToolCallOutputItem, 'id'>[] = []
  const computerCallOutputItems: Omit<OpenAI.Responses.ResponseComputerToolCallOutputItem, 'id'>[] = []

  tool_outputs.forEach((toolOutput) => {
    const { isComputerCallOutput, parsedOutput } = computerCallOutput({ toolOutput })

    if (isComputerCallOutput) {
      computerCallOutputItems.push({
        type: 'computer_call_output' as const,
        call_id: toolOutput.tool_call_id!,
        output: parsedOutput,
        // @ts-expect-error compat
        acknowledged_safety_checks: toolOutput.acknowledged_safety_checks ?? [],
      })
    } else {
      functionCallOutputItems.push({
        type: 'function_call_output' as const,
        call_id: toolOutput.tool_call_id!,
        output: toolOutput.output ?? '',
      })
    }
  })

  return {
    functionCallOutputItems,
    computerCallOutputItems,
  }
}

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

  const response = await client.responses.create({
    conversation: threadId,
    input,
    instructions: openaiAssistant.instructions,
    model: openaiAssistant.model,
    // metadata,
    stream,
    ...serializeTools({ tools: openaiAssistant.tools }),
    ...(openaiAssistant.truncation_strategy ? { truncation: openaiAssistant.truncation_strategy.type } : {}),
    // text: response_format,
  })

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

        controller.enqueue(`data: ${JSON.stringify({
          event: 'thread.run.step.completed',
          data: serializeItemAsFunctionCallRunStep({
            item: toolCallItem,
            items: toolCallOutputItems.functionCallOutputItems,
            threadId,
            openaiAssistant,
            runId,
          })
        })}\n\n`)
      })

      toolCallOutputItems.computerCallOutputItems.forEach((item) => {
        const toolCallItem = previousResponse.output.find((i) => (
          i.type === 'computer_call' &&
            i.call_id === item.call_id
        )) as OpenAI.Responses.ResponseComputerToolCall | undefined

        if (!toolCallItem) {
          return
        }

        controller.enqueue(`data: ${JSON.stringify({
          event: 'thread.run.step.completed',
          data: serializeItemAsComputerCallRunStep({
            item: toolCallItem,
            items: toolCallOutputItems.computerCallOutputItems,
            threadId,
            openaiAssistant,
            runId,
          })
        })}\n\n`)
      })

      await runAdapter.handleRun({
        threadId,
        response,
        onEvent: async (event) => (
          controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
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
