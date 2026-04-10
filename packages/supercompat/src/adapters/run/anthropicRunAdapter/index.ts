/**
 * Anthropic run adapter for the Responses API surface.
 *
 * Calls Anthropic's beta.messages.create() with native beta tools
 * (web_search, code_execution, computer_use) and translates Anthropic
 * streaming events → Responses API events.
 *
 * Also handles regular function tools via Anthropic's tool_use format.
 */
import type Anthropic from '@anthropic-ai/sdk'
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

// Track which tool names correspond to computer use
const COMPUTER_TOOL_NAME = 'computer'

// Map Anthropic computer action → OpenAI Responses computer action
const translateAnthropicAction = (input: any): any => {
  if (!input || typeof input !== 'object') return { type: 'screenshot' }

  const action = input.action || input.type
  switch (action) {
    case 'screenshot':
      return { type: 'screenshot' }
    case 'click':
    case 'left_click':
      return {
        type: 'click',
        button: 'left',
        x: input.coordinate?.[0] ?? 0,
        y: input.coordinate?.[1] ?? 0,
      }
    case 'right_click':
      return {
        type: 'click',
        button: 'right',
        x: input.coordinate?.[0] ?? 0,
        y: input.coordinate?.[1] ?? 0,
      }
    case 'middle_click':
      return {
        type: 'click',
        button: 'wheel',
        x: input.coordinate?.[0] ?? 0,
        y: input.coordinate?.[1] ?? 0,
      }
    case 'double_click':
      return {
        type: 'double_click',
        x: input.coordinate?.[0] ?? 0,
        y: input.coordinate?.[1] ?? 0,
      }
    case 'type':
      return { type: 'type', text: input.text || '' }
    case 'key':
      return { type: 'keypress', keys: [input.key || ''] }
    case 'scroll':
      return {
        type: 'scroll',
        x: input.coordinate?.[0] ?? 0,
        y: input.coordinate?.[1] ?? 0,
        scroll_x: 0,
        scroll_y: input.direction === 'up' ? -(input.amount || 3) * 100
          : input.direction === 'down' ? (input.amount || 3) * 100
          : input.direction === 'left' ? -(input.amount || 3) * 100
          : (input.amount || 3) * 100,
      }
    case 'mouse_move':
      return {
        type: 'move',
        x: input.coordinate?.[0] ?? 0,
        y: input.coordinate?.[1] ?? 0,
      }
    case 'drag':
      return {
        type: 'drag',
        path: [
          { x: input.start_coordinate?.[0] ?? 0, y: input.start_coordinate?.[1] ?? 0 },
          { x: input.end_coordinate?.[0] ?? 0, y: input.end_coordinate?.[1] ?? 0 },
        ],
      }
    case 'wait':
      return { type: 'wait' }
    default:
      // Pass through unknown actions as-is with type
      return { type: action || 'screenshot', ...input }
  }
}

// Models that use the newer computer_20251124 tool type
const usesNewComputerTool = (model: string) => {
  const m = model.toLowerCase()
  return m.includes('4-6') || m.includes('4.6') || m.includes('opus-4-6') || m.includes('sonnet-4-6')
}

// Map Responses API tool format → Anthropic tool format
const serializeTools = (tools: any[], model: string): { tools: any[]; betas: string[]; computerToolNames: Set<string> } => {
  const anthropicTools: any[] = []
  const betas = new Set<string>()
  const computerToolNames = new Set<string>()

  for (const tool of tools) {
    if (tool.type === 'function') {
      anthropicTools.push({
        name: tool.name,
        description: tool.description || '',
        input_schema: tool.parameters || { type: 'object', properties: {} },
      })
    } else if (tool.type === 'web_search_preview' || tool.type === 'web_search') {
      anthropicTools.push({ type: 'web_search_20250305', name: 'web_search' })
      betas.add('web-search-2025-03-05')
    } else if (tool.type === 'code_interpreter') {
      anthropicTools.push({ type: 'code_execution_20250522', name: 'code_execution' })
      betas.add('code-execution-2025-05-22')
    } else if (tool.type === 'computer' || tool.type === 'computer_use_preview') {
      const useNew = usesNewComputerTool(model)
      anthropicTools.push({
        type: useNew ? 'computer_20251124' : 'computer_20250124',
        display_width_px: tool.display_width || 1280,
        display_height_px: tool.display_height || 720,
      })
      betas.add(useNew ? 'computer-use-2025-11-24' : 'computer-use-2025-01-24')
      computerToolNames.add(COMPUTER_TOOL_NAME)
    }
  }

  return { tools: anthropicTools, betas: Array.from(betas), computerToolNames }
}

// Convert Responses input → Anthropic messages
const serializeInput = (input: any, instructions?: string): { system?: string; messages: any[] } => {
  const messages: any[] = []
  let system = instructions || undefined

  if (typeof input === 'string') {
    messages.push({ role: 'user', content: input })
  } else if (Array.isArray(input)) {
    for (const item of input) {
      if (item.type === 'message') {
        messages.push({
          role: item.role || 'user',
          content: typeof item.content === 'string' ? item.content
            : Array.isArray(item.content)
              ? item.content.map((c: any) => {
                  if (c.type === 'input_text') return { type: 'text', text: c.text }
                  if (c.type === 'output_text') return { type: 'text', text: c.text }
                  return c
                })
              : String(item.content),
        })
      } else if (item.type === 'function_call') {
        messages.push({
          role: 'assistant',
          content: [{
            type: 'tool_use',
            id: item.call_id,
            name: item.name,
            input: JSON.parse(item.arguments || '{}'),
          }],
        })
      } else if (item.type === 'function_call_output') {
        messages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: item.call_id,
            content: item.output,
          }],
        })
      } else if (item.type === 'computer_call_output') {
        // Translate computer_call_output → Anthropic tool_result with screenshot
        const resultContent: any[] = []
        if (item.output?.type === 'computer_screenshot' && item.output?.image_url) {
          // Extract base64 from data URL
          const match = item.output.image_url.match(/^data:([^;]+);base64,(.+)$/)
          if (match) {
            resultContent.push({
              type: 'image',
              source: { type: 'base64', media_type: match[1], data: match[2] },
            })
          }
        }
        messages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: item.call_id,
            content: resultContent.length > 0 ? resultContent : 'Action executed',
          }],
        })
      }
    }
  }

  return { system, messages }
}

export const anthropicRunAdapter = ({
  anthropic,
}: {
  anthropic: Anthropic
}) => ({
  type: 'responses-anthropic' as const,

  handleRun: async ({
    body: requestBody,
    onEvent,
  }: HandleArgs) => {
    const { tools: anthropicTools, betas, computerToolNames } = serializeTools(requestBody.tools || [], requestBody.model || '')
    const { system, messages } = serializeInput(requestBody.input, requestBody.instructions)

    const responseId = `resp_${uid(24)}`

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
      response: {
        id: responseId,
        object: 'response',
        status: 'in_progress',
      },
    })

    const createParams: any = {
      model: requestBody.model,
      max_tokens: requestBody.max_output_tokens || 4096,
      messages,
      stream: true,
    }
    if (system) createParams.system = system
    if (anthropicTools.length > 0) createParams.tools = anthropicTools
    if (requestBody.temperature != null) createParams.temperature = requestBody.temperature
    if (requestBody.top_p != null) createParams.top_p = requestBody.top_p

    // Call Anthropic API
    const stream = betas.length > 0
      ? anthropic.beta.messages.stream({ ...createParams, betas })
      : anthropic.messages.stream(createParams)

    const output: any[] = []
    let currentText = ''
    let currentMessageId = ''
    const toolUseBlocks: Map<number, { id: string; name: string; arguments: string }> = new Map()

    for await (const event of stream) {
      if (event.type === 'message_start') {
        currentMessageId = `msg_${uid(24)}`
      }

      if (event.type === 'content_block_start') {
        const block = (event as any).content_block
        const index = (event as any).index

        if (block.type === 'text') {
          // Text output block
          await onEvent({
            type: 'response.output_item.added',
            output_index: output.length,
            item: {
              id: currentMessageId,
              type: 'message',
              role: 'assistant',
              status: 'in_progress',
              content: [{ type: 'output_text', text: '' }],
            },
          })
        } else if (block.type === 'tool_use') {
          toolUseBlocks.set(index, { id: block.id, name: block.name, arguments: '' })
        }
      }

      if (event.type === 'content_block_delta') {
        const delta = (event as any).delta
        const index = (event as any).index

        if (delta.type === 'text_delta') {
          currentText += delta.text
          await onEvent({
            type: 'response.output_text.delta',
            output_index: output.length,
            content_index: 0,
            delta: delta.text,
          })
        } else if (delta.type === 'input_json_delta') {
          const toolBlock = toolUseBlocks.get(index)
          if (toolBlock) {
            toolBlock.arguments += delta.partial_json
          }
        }
      }

      if (event.type === 'content_block_stop') {
        const index = (event as any).index
        const toolBlock = toolUseBlocks.get(index)

        if (toolBlock) {
          const isComputerUse = computerToolNames.has(toolBlock.name)

          if (isComputerUse) {
            // Emit as computer_call output item
            const input = JSON.parse(toolBlock.arguments || '{}')
            const action = translateAnthropicAction(input)
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
              call_id: toolBlock.id,
              name: toolBlock.name,
              arguments: toolBlock.arguments,
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
              call_id: toolBlock.id,
              name: toolBlock.name,
              arguments: toolBlock.arguments,
            })

            await onEvent({
              type: 'response.output_item.done',
              output_index: output.length - 1,
              item: functionCallItem,
            })
          }

          toolUseBlocks.delete(index)
        }
      }

      if (event.type === 'message_stop') {
        // Finalize text message if we have text
        if (currentText) {
          const messageItem = {
            id: currentMessageId,
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: currentText, annotations: [] }],
          }
          output.push(messageItem)

          await onEvent({
            type: 'response.output_text.done',
            output_index: output.length - 1,
            content_index: 0,
            text: currentText,
          })

          await onEvent({
            type: 'response.output_item.done',
            output_index: output.length - 1,
            item: messageItem,
          })
        }
      }
    }

    // Get final message for usage
    const finalMessage = await stream.finalMessage()
    const usage = {
      input_tokens: finalMessage.usage?.input_tokens ?? 0,
      output_tokens: finalMessage.usage?.output_tokens ?? 0,
      total_tokens: (finalMessage.usage?.input_tokens ?? 0) + (finalMessage.usage?.output_tokens ?? 0),
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
        usage,
        created_at: dayjs().unix(),
      },
    })
  },

})
