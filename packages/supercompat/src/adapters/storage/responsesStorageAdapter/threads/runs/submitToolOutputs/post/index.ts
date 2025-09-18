import type { OpenAI } from 'openai'
import type { RunAdapterPartobClient } from '@/types'
import { submitToolOutputsRegexp } from '@/lib/runs/submitToolOutputsRegexp'
import { serializeItemAsRunStep } from '@/lib/items/serializeItemAsRunStep'

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

const getFunctionCallOutputItems = ({
  tool_outputs,
}: {
  tool_outputs: OpenAI.Beta.Threads.RunSubmitToolOutputsParams['tool_outputs']
}) => (
  tool_outputs.map((toolOutput) => ({
    type: 'function_call_output' as const,
    call_id: toolOutput.tool_call_id,
    output: toolOutput.output,
  }))
)

export const post = ({
  client,
  runAdapter,
}: {
  client: OpenAI
  runAdapter: RunAdapterPartobClient
}) => async (urlString: string, options: any) => {
  const url = new URL(urlString)
  const [, threadId, runId] = url.pathname.match(new RegExp(submitToolOutputsRegexp))!

  const body = JSON.parse(options.body)

  const {
    tool_outputs,
    stream,
  } = body

  const functionCallOutputItems = getFunctionCallOutputItems({ tool_outputs })

  const previousResponse = await client.responses.retrieve(runId)

  const openaiAssistant = await runAdapter.getOpenaiAssistant()

  const response = await client.responses.create({
    conversation: threadId,
    input: functionCallOutputItems,
    instructions: openaiAssistant.instructions,
    model: openaiAssistant.model,
    // metadata,
    stream,
    ...serializeTools({ tools: openaiAssistant.tools }),
    // truncation: truncation_strategy.type,
    // text: response_format,
  })

  const readableStream = new ReadableStream({
    async start(controller) {
      functionCallOutputItems.forEach((item) => {
        const functionCallItem = previousResponse.output.find((i) => (
          i.type === 'function_call' && i.call_id === item.call_id
        ))

        if (!functionCallItem) {
          return
        }

        controller.enqueue(`data: ${JSON.stringify({
          event: 'thread.run.step.completed',
          data: serializeItemAsRunStep({
            item: functionCallItem,
            items: functionCallOutputItems,
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
