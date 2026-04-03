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

export type ResponsesRunEvent = {
  type: string
  [key: string]: any
}

type HandleArgs = {
  requestBody: any
  onEvent: (event: ResponsesRunEvent) => Promise<void>
}

// Map Responses API tool format → Anthropic tool format
const serializeTools = (tools: any[]): { tools: any[]; betas: string[] } => {
  const anthropicTools: any[] = []
  const betas = new Set<string>()

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
      anthropicTools.push({
        type: 'computer_20250124',
        display_width_px: tool.display_width || 1280,
        display_height_px: tool.display_height || 720,
      })
      betas.add('computer-use-2025-01-24')
    }
  }

  return { tools: anthropicTools, betas: [...betas] }
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

  handleResponsesRun: async ({
    requestBody,
    onEvent,
  }: HandleArgs) => {
    const { tools: anthropicTools, betas } = serializeTools(requestBody.tools || [])
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
    let currentTextIndex = 0
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
        } else if (block.type === 'web_search_tool_result' || block.type === 'code_execution_tool_result') {
          // Built-in tool results — these are included in the output as-is
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
          // Function call completed
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

  handleRun: async () => {
    throw new Error('anthropicRunAdapter does not support Assistants-style handleRun.')
  },
})
