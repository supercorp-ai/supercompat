import type OpenAI from 'openai'
import type { AIProjectsClient, ThreadRunOutput } from '@azure/ai-projects'
import dayjs from 'dayjs'
import { assign } from 'radash'
import { runsRegexp } from '@/lib/runs/runsRegexp'
import { serializeRun } from './serializeRun'
import { RunAdapterPartobClient } from '@/types'
import { onEvent } from './onEvent'
import { getMessages } from './getMessages'

type RunCreateResponse = Response & {
  json: () => Promise<ReturnType<OpenAI.Beta.Threads.Runs['create']>>
}

export const post = ({
  azureAiProjectsClient,
  runAdapter,
}: {
  azureAiProjectsClient: AIProjectsClient
  runAdapter: RunAdapterPartobClient
}) => async (urlString: string, options: any): Promise<RunCreateResponse> => {
  const url = new URL(urlString)
  const [, threadId] = url.pathname.match(new RegExp(runsRegexp))!

  const body = JSON.parse(options.body)
  const {
    assistant_id,
    stream,
    model,
    instructions,
    additional_instructions,
    tools,
    temperature,
    top_p,
    max_prompt_tokens,
    max_completion_tokens,
    truncation_strategy,
    tool_choice,
    response_format,
    metadata,
  } = body

  // const assistant = await prisma.assistant.findUnique({
  //   where: {
  //     id: assistant_id,
  //   },
  // })
  //
  // if (!assistant) {
  //   throw new Error('Assistant not found')
  // }
  //
  // const {
  //   model,
  //   instructions,
  //   // additional_instructions,
  //   tools,
  //   metadata,
  //   response_format,
  //   truncation_strategy,
  // } = assign({
  //   model: assistant.modelSlug,
  //   instructions: '',
  //   additional_instructions: null,
  //   truncation_strategy: {
  //     type: 'auto',
  //   },
  //   response_format: {
  //     type: 'text',
  //   },
  //   // tools: [],
  //   // metadata: {},
  // }, body)

  const response = azureAiProjectsClient.agents.createRun(threadId, assistant_id, {
    stream,
    ...(model ? { model } : {}),
    ...(instructions ? { instructions } : {}),
    ...(additional_instructions ? { additionalInstructions: additional_instructions } : {}),
    ...(tools ? { tools } : {}),
    ...(temperature ? { temperature } : {}),
    ...(top_p ? { topP: top_p } : {}),
    ...(max_prompt_tokens ? { maxPromptTokens: max_prompt_tokens } : {}),
    ...(max_completion_tokens ? { maxCompletionTokens: max_completion_tokens } : {}),
    ...(truncation_strategy ? { truncationStrategy: truncation_strategy } : {}),
    ...(tool_choice ? { toolChoice: tool_choice } : {}),
    ...(response_format ? { responseFormat: response_format } : {}),
    ...(metadata ? { metadata } : {}),
  })

  // const readableStream = new ReadableStream({
  //   async start(controller) {
  //     try {
  //       await runAdapter({
  //         run: data,
  //         onEvent: onEvent({
  //           controller: {
  //             ...controller,
  //             enqueue: (data) => {
  //               controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
  //             },
  //           },
  //           prisma,
  //         }),
  //         getMessages: getMessages({
  //           prisma,
  //           run,
  //         }),
  //       })
  //     } catch (error: any) {
  //       console.error(error)
  //
  //       onEvent({
  //         controller: {
  //           ...controller,
  //           enqueue: (data) => {
  //             controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
  //           },
  //         },
  //         prisma,
  //       })({
  //         event: 'thread.run.failed',
  //         data: {
  //           id: run.id,
  //           failed_at: dayjs().unix(),
  //           last_error: {
  //             code: 'server_error',
  //             message: `${error?.message ?? ''} ${error?.cause?.message ?? ''}`,
  //           },
  //         },
  //       } as OpenAI.Beta.AssistantStreamEvent.ThreadRunFailed)
  //     }
  //
  //     controller.close()
  //   },
  // })

  if (stream) {
    return new Response(response.stream, {
      headers: {
        'Content-Type': 'text/event-stream',
      },
    })
  } else {
    const data = serializeRun({ run: await response })

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
