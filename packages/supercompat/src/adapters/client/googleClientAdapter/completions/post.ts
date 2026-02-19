import type { GoogleGenAI, Content, Part, Tool, FunctionResponsePart } from '@google/genai'
import { createId } from '@paralleldrive/cuid2'
import { uid } from 'radash'
import { nonEmptyMessages } from '@/lib/messages/nonEmptyMessages'
import { normalizeComputerToolCallPayload } from '../../anthropicClientAdapter/normalizeComputerToolCallPayload'
import { normalizeGeminiAction, isGeminiAction } from '../normalizeGeminiAction'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip the `default_api:` prefix Gemini adds to computer-use function names */
const stripFunctionPrefix = (name: string) => name.replace(/^default_api:/, '')

/** Collect user-defined function names from OpenAI-format tools */
const getUserDefinedFunctionNames = (tools: any[] | undefined): Set<string> => {
  const names = new Set<string>()
  if (!tools) return names
  for (const t of tools) {
    if (t.type === 'function' && t.function?.name) {
      names.add(t.function.name)
    }
  }
  return names
}

const hasComputerUseTool = (tools: any[] | undefined): boolean =>
  !!tools?.some((t: any) => t.type === 'computer_use_preview')

// ---------------------------------------------------------------------------
// OpenAI → Gemini message conversion
// ---------------------------------------------------------------------------

export const serializeMessages = (messages: any[]): { contents: Content[]; systemInstruction?: string } => {
  const systemParts: string[] = []
  const contents: Content[] = []
  // Track tool_call_id → function name for tool responses
  const toolCallIdToName = new Map<string, string>()

  // Compound sub-action tracking for round-trip serialization
  const geminiCallGroups = new Map<string, { name: string; primaryId: string }>()
  const skipToolResultIds = new Set<string>()
  const lastSubActionMap = new Map<string, string>() // last sub-action tool_call_id → geminiCallId

  for (const msg of messages) {
    if (msg.role === 'system' || msg.role === 'developer') {
      systemParts.push(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content))
      continue
    }

    if (msg.role === 'user') {
      const parts: Part[] = []

      if (typeof msg.content === 'string') {
        parts.push({ text: msg.content })
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            parts.push({ text: part.text })
          } else if (part.type === 'image_url') {
            const url: string = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url
            if (url?.startsWith('data:')) {
              const match = url.match(/^data:([^;]+);base64,(.+)$/)
              if (match) {
                parts.push({ inlineData: { mimeType: match[1], data: match[2] } })
              }
            } else if (url) {
              parts.push({ fileData: { fileUri: url, mimeType: 'image/png' } })
            }
          }
        }
      }

      if (parts.length > 0) {
        contents.push({ role: 'user', parts })
      }
      continue
    }

    if (msg.role === 'assistant') {
      const parts: Part[] = []

      if (msg.content) {
        const text = typeof msg.content === 'string' ? msg.content : ''
        if (text) {
          parts.push({ text })
        }
      }

      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          const name = tc.function?.name ?? ''
          const id = tc.id ?? `call_${createId()}`
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(tc.function?.arguments ?? '{}')
          } catch {}

          // Extract private fields stashed by our streaming handler
          const thoughtSignature = args._thoughtSignature as string | undefined
          const geminiActionName = args._geminiAction as string | undefined
          const geminiCallId = args._geminiCallId as string | undefined
          const subActionIndex = args._subActionIndex as number | undefined
          const subActionTotal = args._subActionTotal as number | undefined
          const geminiOrigArgs = args._geminiArgs as Record<string, unknown> | undefined
          const cleanArgs = { ...args }
          delete cleanArgs._thoughtSignature
          delete cleanArgs._geminiAction
          delete cleanArgs._geminiCallId
          delete cleanArgs._subActionIndex
          delete cleanArgs._subActionTotal
          delete cleanArgs._geminiArgs

          // Handle compound sub-actions (multiple tool calls from one Gemini function)
          if (geminiCallId && typeof subActionIndex === 'number' && typeof subActionTotal === 'number') {
            if (subActionIndex === 0) {
              // Primary: create one functionCall for the original Gemini action
              const fcName = geminiActionName ?? name
              geminiCallGroups.set(geminiCallId, { name: fcName, primaryId: id })
              toolCallIdToName.set(id, fcName)
              if (subActionTotal > 1) skipToolResultIds.add(id)

              const fcPart: Part = { functionCall: { name: fcName, args: geminiOrigArgs ?? {}, id } }
              if (thoughtSignature) (fcPart as any).thoughtSignature = thoughtSignature
              parts.push(fcPart)
            } else if (subActionIndex === subActionTotal - 1) {
              // Last: its tool result maps back to the group
              lastSubActionMap.set(id, geminiCallId)
            } else {
              // Middle: skip functionCall and tool result
              skipToolResultIds.add(id)
            }
            continue
          }

          // Normal (non-compound) tool call
          let geminiName = name
          if (name === 'computer_call' && args.action && typeof args.action === 'object') {
            geminiName = geminiActionName ?? (args.action as any).type ?? name
          }

          let geminiArgs: Record<string, unknown>
          if (name === 'computer_call' && cleanArgs.action && typeof cleanArgs.action === 'object') {
            const action = cleanArgs.action as Record<string, unknown>
            const { type: _type, ...rest } = action
            geminiArgs = rest
          } else {
            geminiArgs = cleanArgs
          }

          toolCallIdToName.set(id, geminiName)

          const fcPart: Part = { functionCall: { name: geminiName, args: geminiArgs, id } }
          if (thoughtSignature) {
            (fcPart as any).thoughtSignature = thoughtSignature
          }
          parts.push(fcPart)
        }
      }

      if (parts.length > 0) {
        contents.push({ role: 'model', parts })
      }
      continue
    }

    if (msg.role === 'tool') {
      const toolCallId = msg.tool_call_id ?? ''

      // Skip tool results for non-last compound sub-actions
      if (skipToolResultIds.has(toolCallId)) continue

      // Determine name and ID — remap last sub-action to original Gemini call
      let responseName: string
      let responseId: string
      if (lastSubActionMap.has(toolCallId)) {
        const gcId = lastSubActionMap.get(toolCallId)!
        const group = geminiCallGroups.get(gcId)!
        responseName = group.name
        responseId = group.primaryId
      } else {
        responseName = toolCallIdToName.get(toolCallId) ?? ''
        responseId = toolCallId
      }

      const parts: Part[] = []

      // Check for image content (screenshots from computer use)
      const imageContent = extractImageFromToolMessage(msg)

      if (imageContent) {
        const responseParts: FunctionResponsePart[] = [{
          inlineData: {
            mimeType: imageContent.mimeType,
            data: imageContent.data,
          },
        }]
        parts.push({
          functionResponse: {
            id: responseId,
            name: responseName,
            response: { output: 'Screenshot captured.' },
            parts: responseParts,
          },
        })
      } else {
        const output = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        parts.push({
          functionResponse: {
            id: responseId,
            name: responseName,
            response: { output },
          },
        })
      }

      // Merge consecutive tool responses into a single user turn
      const lastContent = contents[contents.length - 1]
      if (lastContent && lastContent.role === 'user' && lastContent.parts?.some((p) => p.functionResponse)) {
        lastContent.parts!.push(...parts)
      } else {
        contents.push({ role: 'user', parts })
      }
      continue
    }
  }

  return {
    contents,
    ...(systemParts.length > 0 ? { systemInstruction: systemParts.join('\n') } : {}),
  }
}

// ---------------------------------------------------------------------------
// Extract base64 image data from a tool message (computer_screenshot output)
// ---------------------------------------------------------------------------

const extractImageFromToolMessage = (msg: any): { mimeType: string; data: string } | null => {
  const content = msg.content

  // Content array with image_url parts
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part.type === 'image_url') {
        const url = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url
        return parseDataUri(url)
      }
    }
    return null
  }

  // String content — try parsing as JSON with computer_screenshot
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content)
      if (parsed.type === 'computer_screenshot' && parsed.image_url) {
        return parseDataUri(parsed.image_url)
      }
    } catch {}
  }

  return null
}

const parseDataUri = (url: string | undefined): { mimeType: string; data: string } | null => {
  if (!url) return null
  const match = url.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return { mimeType: match[1], data: match[2] }
}

// ---------------------------------------------------------------------------
// OpenAI tools → Gemini tools
// ---------------------------------------------------------------------------

const serializeTools = (tools: any[] | undefined): Tool[] => {
  if (!tools || tools.length === 0) return []

  const geminiTools: Tool[] = []
  const functionDeclarations: any[] = []
  let computerUseEnabled = false

  for (const tool of tools) {
    if (tool.type === 'computer_use_preview') {
      computerUseEnabled = true
      continue
    }

    if (tool.type === 'function') {
      const fn = tool.function
      if (!fn) continue

      const decl: any = {
        name: fn.name,
      }
      if (fn.description) {
        decl.description = fn.description
      }
      if (fn.parameters) {
        decl.parameters = fn.parameters
      }
      functionDeclarations.push(decl)
    }
  }

  if (computerUseEnabled) {
    geminiTools.push({
      computerUse: {
        environment: 'ENVIRONMENT_BROWSER' as any,
        excludedPredefinedFunctions: [
          'navigate',
          'go_back',
          'go_forward',
          'search',
          'open_web_browser',
        ],
      } as any,
    })
  }

  if (functionDeclarations.length > 0) {
    geminiTools.push({ functionDeclarations })
  }

  return geminiTools
}

// ---------------------------------------------------------------------------
// Gemini coordinate denormalization (0–1000 → pixel coords)
// ---------------------------------------------------------------------------

const denormalizeCoords = (
  args: Record<string, unknown>,
  tools: any[] | undefined,
): Record<string, unknown> => {
  const computerTool = tools?.find((t: any) => t.type === 'computer_use_preview')
  if (!computerTool) return args

  const displayWidth = computerTool.computer_use_preview?.display_width ?? 1280
  const displayHeight = computerTool.computer_use_preview?.display_height ?? 720

  const result = { ...args }

  const denormX = (v: number) => Math.round((v / 1000) * displayWidth)
  const denormY = (v: number) => Math.round((v / 1000) * displayHeight)

  if (typeof result.x === 'number') result.x = denormX(result.x)
  if (typeof result.y === 'number') result.y = denormY(result.y)

  if (typeof result.coordinate_x === 'number') result.coordinate_x = denormX(result.coordinate_x)
  if (typeof result.coordinate_y === 'number') result.coordinate_y = denormY(result.coordinate_y)

  if (Array.isArray(result.coordinate) && result.coordinate.length === 2) {
    result.coordinate = [denormX(result.coordinate[0]), denormY(result.coordinate[1])]
  }

  if (Array.isArray(result.start_coordinate) && result.start_coordinate.length === 2) {
    result.start_coordinate = [denormX(result.start_coordinate[0]), denormY(result.start_coordinate[1])]
  }
  if (Array.isArray(result.end_coordinate) && result.end_coordinate.length === 2) {
    result.end_coordinate = [denormX(result.end_coordinate[0]), denormY(result.end_coordinate[1])]
  }

  if (typeof result.destination_x === 'number') result.destination_x = denormX(result.destination_x)
  if (typeof result.destination_y === 'number') result.destination_y = denormY(result.destination_y)

  return result
}

// ---------------------------------------------------------------------------
// Gemini FunctionCall → OpenAI tool_calls delta (with computer_call wrapping)
// ---------------------------------------------------------------------------

/**
 * Determine whether a function call is a Gemini computer-use action.
 * Any function not explicitly declared by the user is treated as
 * a computer-use action when computerUse tool is enabled.
 */
const isComputerUseFunction = (
  name: string,
  tools: any[] | undefined,
): boolean => {
  if (!hasComputerUseTool(tools)) return false
  const userFns = getUserDefinedFunctionNames(tools)
  return !userFns.has(name)
}

const functionCallToToolCallDeltas = (
  fc: any,
  startIndex: number,
  tools: any[] | undefined,
  thoughtSignature?: string,
): any[] => {
  const rawName: string = fc.name ?? ''
  const name = stripFunctionPrefix(rawName)

  if (isComputerUseFunction(name, tools)) {
    const denormed = denormalizeCoords(fc.args ?? {}, tools)

    if (isGeminiAction(name)) {
      const normalizedActions = normalizeGeminiAction(name, denormed)

      if (normalizedActions.length === 1) {
        // Single action — simple metadata
        const payload: Record<string, unknown> = { ...normalizedActions[0] }
        payload._geminiAction = name
        if (thoughtSignature) payload._thoughtSignature = thoughtSignature

        return [{
          index: startIndex,
          id: fc.id ?? `call_${createId()}`,
          type: 'function',
          function: {
            name: 'computer_call',
            arguments: JSON.stringify(payload),
          },
        }]
      }

      // Compound action — emit multiple tool calls with grouping metadata
      const geminiCallId = `gcall_${createId()}`
      return normalizedActions.map((normalized, i) => {
        const payload: Record<string, unknown> = { ...normalized }
        payload._geminiCallId = geminiCallId
        payload._geminiAction = name
        payload._subActionIndex = i
        payload._subActionTotal = normalizedActions.length
        if (i === 0) {
          payload._geminiArgs = denormed
          if (thoughtSignature) payload._thoughtSignature = thoughtSignature
        }

        return {
          index: startIndex + i,
          id: i === 0 ? (fc.id ?? `call_${createId()}`) : `call_${createId()}`,
          type: 'function',
          function: {
            name: 'computer_call',
            arguments: JSON.stringify(payload),
          },
        }
      })
    }

    // Non-Gemini computer use — use Anthropic normalizer
    const normalized = normalizeComputerToolCallPayload({ ...denormed, type: name })
    const payload: Record<string, unknown> = { ...normalized }
    if (thoughtSignature) payload._thoughtSignature = thoughtSignature

    return [{
      index: startIndex,
      id: fc.id ?? `call_${createId()}`,
      type: 'function',
      function: {
        name: 'computer_call',
        arguments: JSON.stringify(payload),
      },
    }]
  }

  const args = fc.args ?? {}
  if (thoughtSignature) {
    args._thoughtSignature = thoughtSignature
  }

  return [{
    index: startIndex,
    id: fc.id ?? `call_${createId()}`,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  }]
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Synthetic response for pending compound sub-actions
// ---------------------------------------------------------------------------

const syntheticToolCallResponse = (toolCallDelta: any, stream: boolean) => {
  // Reset index to 0 since this is the only tool call in the response
  const delta = { ...toolCallDelta, index: 0 }
  const encoder = new TextEncoder()

  if (stream) {
    const chunks = [
      `data: ${JSON.stringify({
        id: `chatcmpl-${uid(29)}`,
        object: 'chat.completion.chunk',
        choices: [{
          index: 0,
          delta: { content: null, tool_calls: [delta] },
        }],
      })}\n\n`,
      `data: ${JSON.stringify({
        id: `chatcmpl-${uid(29)}`,
        object: 'chat.completion.chunk',
        choices: [{
          index: 0,
          delta: {},
          finish_reason: 'stop',
        }],
      })}\n\n`,
    ]

    return new Response(
      new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
          controller.close()
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream' } },
    )
  }

  return new Response(JSON.stringify({
    data: {
      id: `chatcmpl-${uid(29)}`,
      object: 'chat.completion',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [delta],
        },
        finish_reason: 'stop',
      }],
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const post = ({
  google,
}: {
  google: GoogleGenAI
}) => {
  // Queued sub-actions for compound Gemini actions (e.g. type_text_at)
  // Emitted one at a time so superinterface executes them sequentially
  let pendingSubActions: any[] = []

  return async (_url: string, options: any) => {
  const body = JSON.parse(options.body)

  // If there are pending sub-actions, return the next one without calling the model
  if (pendingSubActions.length > 0) {
    const next = pendingSubActions.shift()!
    return syntheticToolCallResponse(next, !!body.stream)
  }

  const messages = nonEmptyMessages({ messages: body.messages })
  const { contents, systemInstruction } = serializeMessages(messages)
  const geminiTools = serializeTools(body.tools)

  const params: any = {
    model: body.model,
    contents,
    config: {
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(geminiTools.length > 0 ? { tools: geminiTools } : {}),
      ...(typeof body.temperature === 'number' ? { temperature: body.temperature } : {}),
      ...(typeof body.top_p === 'number' ? { topP: body.top_p } : {}),
      ...(typeof body.max_tokens === 'number' ? { maxOutputTokens: body.max_tokens } : {}),
    },
  }

  if (body.stream) {
    const response = await google.models.generateContentStream(params)

    const stream = new ReadableStream({
      async start(controller) {
        let chunkIndex = 0
        let lastThoughtSignature: string | undefined

        for await (const chunk of response) {
          const candidate = chunk.candidates?.[0]
          if (!candidate?.content?.parts) continue

          for (const part of candidate.content.parts) {
            // Capture thought signatures — may be on a separate part or
            // on the same part as a functionCall
            if (part.thoughtSignature) {
              lastThoughtSignature = part.thoughtSignature
            }

            // Skip thought-only parts (internal model reasoning)
            if (part.thought && !part.functionCall) continue

            if (part.text !== undefined && part.text !== null && !part.thought) {
              const messageDelta = {
                id: `chatcmpl-${uid(29)}`,
                object: 'chat.completion.chunk',
                choices: [{
                  index: 0,
                  delta: { content: part.text },
                }],
              }
              controller.enqueue(`data: ${JSON.stringify(messageDelta)}\n\n`)
            }

            if (part.functionCall) {
              const deltas = functionCallToToolCallDeltas(
                part.functionCall,
                chunkIndex,
                body.tools,
                lastThoughtSignature,
              )

              // For compound actions, only emit the first sub-action;
              // queue the rest for sequential execution
              const emitDeltas = deltas.length > 1 ? [deltas[0]] : deltas
              if (deltas.length > 1) {
                pendingSubActions.push(...deltas.slice(1))
              }

              for (const toolCallDelta of emitDeltas) {
                const messageDelta = {
                  id: `chatcmpl-${uid(29)}`,
                  object: 'chat.completion.chunk',
                  choices: [{
                    index: 0,
                    delta: {
                      content: null,
                      tool_calls: [toolCallDelta],
                    },
                  }],
                }
                controller.enqueue(`data: ${JSON.stringify(messageDelta)}\n\n`)
              }
              chunkIndex += emitDeltas.length
              lastThoughtSignature = undefined
            }
          }

          // Emit finish reason if present
          if (candidate.finishReason) {
            const messageDelta = {
              id: `chatcmpl-${uid(29)}`,
              object: 'chat.completion.chunk',
              choices: [{
                index: 0,
                delta: {},
                finish_reason: 'stop',
              }],
            }
            controller.enqueue(`data: ${JSON.stringify(messageDelta)}\n\n`)
          }
        }

        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
      },
    })
  } else {
    try {
      const data = await google.models.generateContent(params)

      const candidate = data.candidates?.[0]
      const parts = candidate?.content?.parts ?? []

      const textParts = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('')

      // Collect thought signatures to attach to function calls
      // Signature can be on the same part as functionCall or a preceding part
      let lastSig: string | undefined
      const toolCalls: any[] = []
      for (const p of parts) {
        if (p.thoughtSignature) {
          lastSig = p.thoughtSignature
        }
        if (p.functionCall) {
          const deltas = functionCallToToolCallDeltas(
            p.functionCall,
            toolCalls.length,
            body.tools,
            lastSig,
          )

          // For compound actions, only include the first sub-action;
          // queue the rest for sequential execution
          if (deltas.length > 1) {
            toolCalls.push(deltas[0])
            pendingSubActions.push(...deltas.slice(1))
          } else {
            toolCalls.push(...deltas)
          }
          lastSig = undefined
        }
      }

      const message: any = {
        role: 'assistant',
        content: textParts || null,
      }
      if (toolCalls.length > 0) {
        message.tool_calls = toolCalls
      }

      const result = {
        id: `chatcmpl-${uid(29)}`,
        object: 'chat.completion',
        choices: [{
          index: 0,
          message,
          finish_reason: 'stop',
        }],
      }

      return new Response(JSON.stringify({
        data: result,
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    } catch (error) {
      return new Response(JSON.stringify({
        error,
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    }
  }
  }
}
