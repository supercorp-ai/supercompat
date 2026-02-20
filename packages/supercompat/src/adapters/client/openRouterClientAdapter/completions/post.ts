import type { OpenRouter } from '@openrouter/sdk'
import { transformTools } from './computerUseTool'
import { denormalizeComputerCallArguments, getQuirks } from './normalizeComputerCall'

const ARTIFACT_TAGS = /<\|begin_of_box\|>|<\|end_of_box\|>/g

const sanitizeContent = (content: string | null | undefined): string | null | undefined => {
  if (!content) return content
  return content.replace(ARTIFACT_TAGS, '').trim()
}

// Convert computer_screenshot JSON in tool messages to image_url content
// so the model can see screenshot images. This is OpenRouter-specific because
// each provider handles image content in tool messages differently.
const convertScreenshotToolMessages = (messages: Record<string, unknown>[]): Record<string, unknown>[] =>
  messages.map((msg) => {
    if (msg.role !== 'tool' || typeof msg.content !== 'string') return msg

    try {
      const parsed = JSON.parse(msg.content)
      if (parsed.type === 'computer_screenshot' && parsed.image_url) {
        return {
          ...msg,
          content: [
            { type: 'image_url', image_url: { url: parsed.image_url } },
          ],
        }
      }
    } catch {}

    return msg
  })

const resolveApiKey = async (
  apiKey: string | (() => Promise<string>) | undefined,
): Promise<string> => {
  if (!apiKey) return ''
  return typeof apiKey === 'function' ? await apiKey() : apiKey
}

// Parse SSE stream from a raw Response, yielding each parsed JSON chunk.
// Bypasses the SDK's strict Zod validation that rejects null tool_call IDs
// in streaming delta chunks (a valid OpenAI streaming convention).
async function* parseSSE(response: Response): AsyncGenerator<Record<string, unknown>> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') return
        try {
          yield JSON.parse(data)
        } catch {}
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// Make a raw request to the OpenRouter API, bypassing the SDK's response
// Zod validation (which rejects null tool_call IDs in streaming deltas).
// The API accepts and returns OpenAI-compatible format directly.
const rawFetch = async (
  openRouter: OpenRouter,
  body: Record<string, unknown>,
): Promise<Response> => {
  const apiKey = await resolveApiKey(openRouter._options.apiKey)
  const baseURL = (openRouter._baseURL?.toString() ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }
  if (body.stream) {
    headers['Accept'] = 'text/event-stream'
  }
  if (openRouter._options.httpReferer) {
    headers['HTTP-Referer'] = openRouter._options.httpReferer
  }
  if (openRouter._options.xTitle) {
    headers['X-Title'] = openRouter._options.xTitle
  }

  const request = new Request(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  // Use the SDK's HTTPClient if available (preserves custom fetcher config
  // like Connection: close), otherwise fall back to global fetch
  const httpClient = openRouter._options.httpClient
  return httpClient
    ? httpClient.request(request)
    : fetch(request)
}

export const post = ({
  openRouter,
}: {
  openRouter: OpenRouter
}) => async (_url: string, options: { body: string }) => {
  const body = JSON.parse(options.body)
  const model = body.model as string

  const { tools: transformedTools, computerUseConfig } = transformTools(body.tools, model)

  const resultOptions = {
    ...body,
    ...(computerUseConfig && body.messages ? { messages: convertScreenshotToolMessages(body.messages) } : {}),
    ...(transformedTools.length > 0 ? { tools: transformedTools } : {}),
  }

  if (body.stream) {
    const response = await rawFetch(openRouter, resultOptions)

    if (!response.ok) {
      return new Response(response.body, {
        status: response.status,
        headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
      })
    }

    const shouldCleanArtifacts = getQuirks(model).cleanArtifacts

    if (!computerUseConfig && !shouldCleanArtifacts) {
      // Pass through the raw SSE response directly — no need to parse and
      // re-serialize when we don't need to modify the chunks.
      return new Response(response.body, {
        status: response.status,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }

    if (!computerUseConfig) {
      const readableStream = new ReadableStream({
        async start(controller) {
          for await (const chunk of parseSSE(response)) {
            const delta = (chunk.choices as Record<string, unknown>[] | undefined)?.[0] as Record<string, unknown> | undefined
            const d = delta?.delta as Record<string, unknown> | undefined
            if (d?.content && typeof d.content === 'string') {
              d.content = sanitizeContent(d.content)
            }
            controller.enqueue(`data: ${JSON.stringify(chunk)}\n\n`)
          }
          controller.close()
        },
      })

      return new Response(readableStream, {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }

    const { displayWidth, displayHeight } = computerUseConfig

    const readableStream = new ReadableStream({
      async start(controller) {
        const computerCallIndices = new Set<number>()
        const argumentBuffers = new Map<number, string>()
        const emittedIndices = new Set<number>()

        for await (const chunk of parseSSE(response)) {
          const choices = (chunk.choices ?? []) as Record<string, unknown>[]
          const choice = choices[0] as Record<string, unknown> | undefined

          const delta = choice?.delta as Record<string, unknown> | undefined
          const toolCalls = delta?.tool_calls as Record<string, unknown>[] | undefined

          if (!toolCalls) {
            controller.enqueue(`data: ${JSON.stringify(chunk)}\n\n`)
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

    return new Response(readableStream, {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  } else {
    try {
      const response = await rawFetch(openRouter, resultOptions)

      if (!response.ok) {
        return new Response(response.body, {
          status: response.status,
          headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
        })
      }

      const data = await response.json()

      if (computerUseConfig) {
        for (const choice of (data.choices ?? []) as Record<string, unknown>[]) {
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
        for (const choice of (data.choices ?? []) as Record<string, unknown>[]) {
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
