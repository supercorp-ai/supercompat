import type { OpenAI } from 'openai'
import { submitToolOutputsRegexp } from '@/lib/runs/submitToolOutputsRegexp'
import { RunAdapterPartobClient } from '@/types'
// import { onEvent } from '../../onEvent'

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

const serializeInput = ({
  tool_outputs,
}: {
  tool_outputs: OpenAI.Beta.Threads.RunSubmitToolOutputsParams['tool_outputs']
}) => (
  tool_outputs.map((toolOutput) => ({
    type: 'function_call_output',
    call_id: toolOutput.tool_call_id,
    output: toolOutput.output,
  }))
)

export const post = ({
  openai,
  openaiAssistant,
  runAdapter,
}: {
  openai: OpenAI
  openaiAssistant: OpenAI.Beta.Assistants.Assistant
  runAdapter: RunAdapterPartobClient
}) => async (urlString: string, options: any) => {
  const url = new URL(urlString)
  const [, threadId, runId] = url.pathname.match(new RegExp(submitToolOutputsRegexp))!

  const body = JSON.parse(options.body)

  const {
    tool_outputs,
    stream,
  } = body

  console.dir({ body }, { depth: null })
  const response = await openai.responses.create({
    conversation: threadId,
    input: serializeInput({
      tool_outputs,
    }),
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
      // const run = await updateRun({
      //   prisma,
      //   runId,
      //   threadId,
      //   tool_outputs,
      //   onThreadRunStepCompleted: async ({ runStep }) => {
      //     controller.enqueue(`data: ${JSON.stringify({
      //       event: 'thread.run.step.completed',
      //       data: serializeRunStep({ runStep }),
      //     })}\n\n`)
      //   }
      // })

      await runAdapter({
        response,
        // run: serializeRun({ run }),
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
