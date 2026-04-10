/**
 * Gemini run adapter for the Responses API surface.
 *
 * Calls Google's Gemini API with native computer_use support.
 * Translates Gemini streaming events → Responses API events.
 *
 * For non-computer-use tools, delegates to completions path.
 */
import type { GoogleGenAI } from '@google/genai'
import { uid } from 'radash'
import dayjs from 'dayjs'
import { RunAdapterBody } from '@/types'

export type ResponsesRunEvent = {
  type: string
  [key: string]: any
}

type HandleArgs = {
  body: RunAdapterBody
  onEvent: (event: ResponsesRunEvent) => Promise<void>
}

// Gemini computer use function names
const GEMINI_COMPUTER_CALL_NAMES = new Set([
  'computer_call',
  'computer_use',
  'computerCall',
])

// Map Gemini computer action args → OpenAI Responses computer action
const translateGeminiAction = (args: any): any => {
  if (!args || typeof args !== 'object') return { type: 'screenshot' }

  // Gemini may return the action directly or nested
  const action = args.action || args
  const actionType = action.type || action.action_type

  switch (actionType) {
    case 'screenshot':
      return { type: 'screenshot' }
    case 'click':
      return {
        type: 'click',
        button: action.button || 'left',
        x: action.x ?? action.coordinate?.[0] ?? 0,
        y: action.y ?? action.coordinate?.[1] ?? 0,
      }
    case 'double_click':
      return {
        type: 'double_click',
        x: action.x ?? action.coordinate?.[0] ?? 0,
        y: action.y ?? action.coordinate?.[1] ?? 0,
      }
    case 'type':
      return { type: 'type', text: action.text || '' }
    case 'key':
    case 'keypress':
      return { type: 'keypress', keys: Array.isArray(action.keys) ? action.keys : [action.key || action.keys || ''] }
    case 'scroll':
      return {
        type: 'scroll',
        x: action.x ?? action.coordinate?.[0] ?? 0,
        y: action.y ?? action.coordinate?.[1] ?? 0,
        scroll_x: action.scroll_x ?? 0,
        scroll_y: action.scroll_y ?? (action.direction === 'up' ? -300 : 300),
      }
    case 'move':
    case 'mouse_move':
      return {
        type: 'move',
        x: action.x ?? action.coordinate?.[0] ?? 0,
        y: action.y ?? action.coordinate?.[1] ?? 0,
      }
    case 'drag':
      return {
        type: 'drag',
        path: action.path || [
          { x: action.start_x ?? 0, y: action.start_y ?? 0 },
          { x: action.end_x ?? 0, y: action.end_y ?? 0 },
        ],
      }
    case 'wait':
      return { type: 'wait' }
    default:
      return { type: actionType || 'screenshot', ...action }
  }
}

export const geminiRunAdapter = ({
  google,
}: {
  google: GoogleGenAI
}) => ({
  type: 'responses-gemini' as const,

  handleRun: async ({
    body: requestBody,
    onEvent,
  }: HandleArgs) => {
    const responseId = `resp_${uid(24)}`

    // Build Gemini request
    const tools: any[] = []
    const hasComputerUse = (requestBody.tools || []).some((t: any) =>
      t.type === 'computer' || t.type === 'computer_use_preview'
    )

    if (hasComputerUse) {
      tools.push({
        computerUse: {
          environment: 'ENVIRONMENT_BROWSER',
        },
      })
    }

    // Add function tools
    const functionDeclarations = (requestBody.tools || [])
      .filter((t: any) => t.type === 'function')
      .map((t: any) => ({
        name: t.name,
        description: t.description || '',
        parameters: t.parameters || {},
      }))

    if (functionDeclarations.length > 0) {
      tools.push({ functionDeclarations })
    }

    // Build messages
    const contents: any[] = []
    const input = requestBody.input
    if (typeof input === 'string') {
      contents.push({ role: 'user', parts: [{ text: input }] })
    } else if (Array.isArray(input)) {
      for (const item of input) {
        if (item.type === 'message' || item.role) {
          const text = typeof item.content === 'string' ? item.content
            : Array.isArray(item.content) ? item.content.map((c: any) => c.text || '').join('')
            : String(item.content)
          contents.push({ role: item.role === 'assistant' ? 'model' : 'user', parts: [{ text }] })
        } else if (item.type === 'computer_call_output') {
          // Translate computer_call_output → Gemini functionResponse
          const screenshotUrl = item.output?.image_url || ''
          contents.push({
            role: 'user',
            parts: [{
              functionResponse: {
                name: 'computer_call',
                response: {
                  current_url: item.current_url || '',
                  screenshot: screenshotUrl,
                },
              },
            }],
          })
        }
      }
    }

    // Emit response.created
    await onEvent({
      type: 'response.created',
      response: {
        id: responseId,
        object: 'response',
        status: 'in_progress',
        model: requestBody.model,
        output: [],
        created_at: dayjs().unix(),
      },
    })

    await onEvent({
      type: 'response.in_progress',
      response: { id: responseId, status: 'in_progress' },
    })

    // Call Gemini
    const response = await google.models.generateContentStream({
      model: requestBody.model,
      contents,
      config: {
        systemInstruction: requestBody.instructions || undefined,
        temperature: requestBody.temperature ?? undefined,
        topP: requestBody.top_p ?? undefined,
        maxOutputTokens: requestBody.max_output_tokens ?? undefined,
        tools: tools.length > 0 ? tools : undefined,
      },
    })

    const output: any[] = []
    let fullText = ''

    for await (const chunk of response) {
      const parts = chunk.candidates?.[0]?.content?.parts || []

      for (const part of parts) {
        if (part.text) {
          fullText += part.text
          await onEvent({
            type: 'response.output_text.delta',
            output_index: 0,
            content_index: 0,
            delta: part.text,
          })
        }

        if (part.functionCall) {
          const fc = part.functionCall
          const isComputerCall = hasComputerUse && GEMINI_COMPUTER_CALL_NAMES.has(fc.name || '')

          if (isComputerCall) {
            // Emit as computer_call
            const action = translateGeminiAction(fc.args)
            const callId = `call_${uid(12)}`

            const computerCallItem = {
              id: `cc_${uid(24)}`,
              call_id: callId,
              type: 'computer_call',
              status: 'completed',
              actions: [action],
              pending_safety_checks: [],
            }
            output.push(computerCallItem)

            await onEvent({
              type: 'response.output_item.added',
              output_index: output.length - 1,
              item: computerCallItem,
            })
            await onEvent({
              type: 'response.output_item.done',
              output_index: output.length - 1,
              item: computerCallItem,
            })
          } else {
            // Regular function call
            const functionCallItem = {
              id: `fc_${uid(24)}`,
              type: 'function_call',
              call_id: `call_${uid(12)}`,
              name: fc.name || '',
              arguments: JSON.stringify(fc.args || {}),
              status: 'completed',
            }
            output.push(functionCallItem)

            await onEvent({
              type: 'response.output_item.added',
              output_index: output.length - 1,
              item: functionCallItem,
            })
            await onEvent({
              type: 'response.function_call_arguments.done',
              output_index: output.length - 1,
              call_id: functionCallItem.call_id,
              name: functionCallItem.name,
              arguments: functionCallItem.arguments,
            })
            await onEvent({
              type: 'response.output_item.done',
              output_index: output.length - 1,
              item: functionCallItem,
            })
          }
        }
      }
    }

    // Add text message to output
    if (fullText) {
      const messageItem = {
        id: `msg_${uid(24)}`,
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: fullText, annotations: [] }],
      }
      output.unshift(messageItem)

      await onEvent({
        type: 'response.output_item.added',
        output_index: 0,
        item: messageItem,
      })
      await onEvent({
        type: 'response.output_text.done',
        output_index: 0,
        content_index: 0,
        text: fullText,
      })
      await onEvent({
        type: 'response.output_item.done',
        output_index: 0,
        item: messageItem,
      })
    }

    // Emit completed
    await onEvent({
      type: 'response.completed',
      response: {
        id: responseId,
        object: 'response',
        status: 'completed',
        model: requestBody.model,
        output,
        created_at: dayjs().unix(),
      },
    })
  },

})
