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

export type ResponsesRunEvent = {
  type: string
  [key: string]: any
}

type HandleArgs = {
  requestBody: any
  onEvent: (event: ResponsesRunEvent) => Promise<void>
}

export const geminiRunAdapter = ({
  google,
}: {
  google: GoogleGenAI
}) => ({
  type: 'responses-gemini' as const,

  handleResponsesRun: async ({
    requestBody,
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

  handleRun: async () => {
    throw new Error('geminiRunAdapter does not support Assistants-style handleRun.')
  },
})
