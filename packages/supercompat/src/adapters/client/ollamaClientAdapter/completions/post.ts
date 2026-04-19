import type OpenAI from 'openai'
import { transformTools } from './computerUseTool'
import { denormalizeComputerCallArguments, getQuirks } from './normalizeComputerCall'

const encoder = new TextEncoder()

const ARTIFACT_TAGS = /<\|begin_of_box\|>|<\|end_of_box\|>/g

const sanitizeContent = (content: string | null | undefined): string | null | undefined => {
  if (!content) return content
  return content.replace(ARTIFACT_TAGS, '').trim()
}

// Ollama's OpenAI-compat endpoint silently drops image content parts from
// `role: "tool"` messages — the image never reaches the model. Verified with
// gemma4:26b, which replies "I didn't actually receive an image" when fed a
// tool message containing `image_url`. User-role images work fine.
//
// Workaround: keep the tool message as a short text receipt (so the
// `tool_call_id` pairing stays valid), and inject a follow-up user message
// carrying the screenshot as an `image_url` content part.
const convertScreenshotToolMessages = (messages: Record<string, unknown>[]): Record<string, unknown>[] =>
  messages.flatMap((msg) => {
    if (msg.role !== 'tool' || typeof msg.content !== 'string') return [msg]

    try {
      const parsed = JSON.parse(msg.content)
      if (parsed.type === 'computer_screenshot' && parsed.image_url) {
        return [
          { ...msg, content: '' },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: parsed.image_url } },
            ],
          },
        ]
      }
    } catch {}

    return [msg]
  })

export const post = ({
  ollama,
}: {
  ollama: OpenAI
}) => async (_url: string, options: any) => {
  const body = JSON.parse(options.body)
  const model = body.model as string

  const { tools: transformedTools, computerUseConfig } = transformTools(body.tools, model)

  const resultOptions = {
    ...body,
    ...(computerUseConfig && body.messages ? { messages: convertScreenshotToolMessages(body.messages) } : {}),
    ...(transformedTools.length > 0 ? { tools: transformedTools } : {}),
  }

  if (body.stream) {
    const response = await ollama.chat.completions.create(resultOptions)

    const shouldCleanArtifacts = !!getQuirks(model).cleanArtifacts

    if (!computerUseConfig && !shouldCleanArtifacts) {
      const stream = new ReadableStream({
        async start(controller) {
          // @ts-ignore - openai SDK returns an async iterable when stream: true
          for await (const chunk of response) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
          }
          controller.close()
        },
      })

      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }

    if (!computerUseConfig) {
      const stream = new ReadableStream({
        async start(controller) {
          // @ts-ignore
          for await (const chunk of response) {
            const choices = (chunk.choices as Record<string, unknown>[] | undefined) ?? []
            const delta = (choices[0] as Record<string, unknown> | undefined)?.delta as Record<string, unknown> | undefined
            if (delta?.content && typeof delta.content === 'string') {
              delta.content = sanitizeContent(delta.content)
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
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

        // @ts-ignore
        for await (const chunk of response) {
          const choices = (chunk.choices ?? []) as Record<string, unknown>[]
          const choice = choices[0] as Record<string, unknown> | undefined

          const delta = choice?.delta as Record<string, unknown> | undefined
          const toolCalls = delta?.tool_calls as Record<string, unknown>[] | undefined

          if (!toolCalls) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
            continue
          }

          const passThrough: Record<string, unknown>[] = []

          for (const tc of toolCalls) {
            const fn = tc.function as Record<string, unknown> | undefined

            if (fn?.name === 'computer_call') {
              computerCallIndices.add(tc.index as number)
              const initialArgs = (fn?.arguments ?? '') as string
              argumentBuffers.set(tc.index as number, initialArgs)

              if (initialArgs) {
                try {
                  JSON.parse(initialArgs)
                  const denormalized = denormalizeComputerCallArguments({
                    argumentsText: initialArgs,
                    displayWidth,
                    displayHeight,
                    model,
                  })
                  passThrough.push({
                    ...tc,
                    function: { ...fn, arguments: denormalized },
                  })
                  emittedIndices.add(tc.index as number)
                  continue
                } catch {
                  // Not complete JSON yet — will be handled in subsequent chunks
                }
              }

              passThrough.push({
                ...tc,
                function: { ...fn, arguments: '' },
              })
              continue
            }

            if (computerCallIndices.has(tc.index as number)) {
              const buf = (argumentBuffers.get(tc.index as number) ?? '') + ((fn?.arguments ?? '') as string)
              argumentBuffers.set(tc.index as number, buf)

              if (!emittedIndices.has(tc.index as number)) {
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
                  emittedIndices.add(tc.index as number)
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
                  ...delta,
                  tool_calls: passThrough,
                },
              }],
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(modifiedChunk)}\n\n`))
          }
        }

        // Flush any remaining buffered computer_call arguments (fuzzy-tolerant)
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
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(flushChunk)}\n\n`))
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
      const data = await ollama.chat.completions.create(resultOptions)

      if (computerUseConfig) {
        for (const choice of ((data as any).choices ?? []) as Record<string, unknown>[]) {
          const message = choice.message as Record<string, unknown> | undefined
          const toolCalls = (message?.tool_calls ?? []) as Record<string, unknown>[]
          for (const tc of toolCalls) {
            const fn = tc.function as Record<string, unknown> | undefined
            if (fn?.name === 'computer_call') {
              fn.arguments = denormalizeComputerCallArguments({
                argumentsText: fn.arguments as string,
                displayWidth: computerUseConfig.displayWidth,
                displayHeight: computerUseConfig.displayHeight,
                model,
              })
            }
          }
        }
      }

      if (getQuirks(model).cleanArtifacts) {
        for (const choice of ((data as any).choices ?? []) as Record<string, unknown>[]) {
          const message = choice.message as Record<string, unknown> | undefined
          if (message?.content && typeof message.content === 'string') {
            message.content = sanitizeContent(message.content)!
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
