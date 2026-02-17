import type OpenAI from 'openai'
import { transformTools } from './computerUseTool'
import { denormalizeComputerCallArguments, getQuirks } from './normalizeComputerCall'

const ARTIFACT_TAGS = /<\|begin_of_box\|>|<\|end_of_box\|>/g

const sanitizeContent = (content: string | null | undefined): string | null | undefined => {
  if (!content) return content
  return content.replace(ARTIFACT_TAGS, '').trim()
}

export const post = ({
  openRouter,
}: {
  openRouter: OpenAI
}) => async (_url: string, options: any) => {
  const body = JSON.parse(options.body)
  const model = body.model as string

  const { tools: transformedTools, computerUseConfig } = transformTools(body.tools, model)

  const resultOptions = {
    ...body,
    ...(transformedTools.length > 0 ? { tools: transformedTools } : {}),
  } as OpenAI.Chat.ChatCompletionCreateParams

  if (body.stream) {
    const response = await openRouter.chat.completions.create(resultOptions)

    const shouldCleanArtifacts = getQuirks(model).cleanArtifacts

    if (!computerUseConfig) {
      const stream = new ReadableStream({
        async start(controller) {
          // @ts-ignore-next-line
          for await (const chunk of response) {
            if (shouldCleanArtifacts) {
              const delta = chunk.choices?.[0]?.delta
              if (delta?.content) {
                delta.content = sanitizeContent(delta.content)
              }
            }
            controller.enqueue(`data: ${JSON.stringify(chunk)}\n\n`)
          }
          controller.close()
        },
      })

      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }

    const { displayWidth, displayHeight } = computerUseConfig

    const stream = new ReadableStream({
      async start(controller) {
        const computerCallIndices = new Set<number>()
        const argumentBuffers = new Map<number, string>()
        const emittedIndices = new Set<number>()

        // @ts-ignore-next-line
        for await (const chunk of response) {
          const choices = chunk.choices ?? []
          const choice = choices[0]

          if (!choice?.delta?.tool_calls) {
            controller.enqueue(`data: ${JSON.stringify(chunk)}\n\n`)
            continue
          }

          const passThrough: any[] = []

          for (const tc of choice.delta.tool_calls) {
            if (tc.function?.name === 'computer_call') {
              computerCallIndices.add(tc.index)
              argumentBuffers.set(tc.index, '')
              passThrough.push({
                ...tc,
                function: { ...tc.function, arguments: '' },
              })
              continue
            }

            if (computerCallIndices.has(tc.index)) {
              const buf = (argumentBuffers.get(tc.index) ?? '') + (tc.function?.arguments ?? '')
              argumentBuffers.set(tc.index, buf)

              if (!emittedIndices.has(tc.index)) {
                try {
                  JSON.parse(buf)
                  const denormalized = denormalizeComputerCallArguments({
                    argumentsText: buf,
                    displayWidth,
                    displayHeight,
                    model,
                  })
                  passThrough.push({
                    index: tc.index,
                    function: { arguments: denormalized },
                  })
                  emittedIndices.add(tc.index)
                } catch {
                  // Not complete JSON yet — keep buffering
                }
              }
              continue
            }

            passThrough.push(tc)
          }

          if (passThrough.length > 0) {
            const modifiedChunk = {
              ...chunk,
              choices: [{
                ...choice,
                delta: {
                  ...choice.delta,
                  tool_calls: passThrough,
                },
              }],
            }
            controller.enqueue(`data: ${JSON.stringify(modifiedChunk)}\n\n`)
          }
        }

        // Flush any remaining buffered computer_call arguments
        for (const [index, buf] of Array.from(argumentBuffers)) {
          if (!emittedIndices.has(index) && buf) {
            const denormalized = denormalizeComputerCallArguments({
              argumentsText: buf,
              displayWidth,
              displayHeight,
              model,
            })
            const flushChunk = {
              object: 'chat.completion.chunk',
              choices: [{
                index: 0,
                delta: {
                  tool_calls: [{
                    index,
                    function: { arguments: denormalized },
                  }],
                },
              }],
            }
            controller.enqueue(`data: ${JSON.stringify(flushChunk)}\n\n`)
          }
        }

        controller.close()
      },
    })

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  } else {
    try {
      const data = await openRouter.chat.completions.create(
        resultOptions,
      ) as OpenAI.Chat.ChatCompletion

      if (computerUseConfig) {
        for (const choice of data.choices ?? []) {
          for (const tc of choice.message?.tool_calls ?? []) {
            const fn = (tc as any).function
            if (fn?.name === 'computer_call') {
              fn.arguments = denormalizeComputerCallArguments({
                argumentsText: fn.arguments,
                displayWidth: computerUseConfig.displayWidth,
                displayHeight: computerUseConfig.displayHeight,
                model,
              })
            }
          }
        }
      }

      if (getQuirks(model).cleanArtifacts) {
        for (const choice of data.choices ?? []) {
          if (choice.message?.content) {
            choice.message.content = sanitizeContent(choice.message.content)!
          }
        }
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      return new Response(JSON.stringify({ error }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }
}
