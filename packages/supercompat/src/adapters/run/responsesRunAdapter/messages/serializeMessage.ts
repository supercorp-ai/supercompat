import type OpenAI from 'openai'
import type { ResponseInputItem } from 'openai/resources/responses/responses'
import { MessageWithRun } from '@/types'

interface ToolMessage {
  id: string
  role: 'tool'
  content: unknown
  tool_call_id?: string
}

type MessageForSerialization = MessageWithRun | ToolMessage

export const serializeMessage = ({
  message,
}: {
  message: MessageForSerialization
}): ResponseInputItem[] => {
  if (message.role === 'tool') {
    const toolMessage = message as ToolMessage
    const output =
      typeof toolMessage.content === 'string'
        ? toolMessage.content
        : JSON.stringify(toolMessage.content)
    return [
      {
        type: 'function_call_output',
        call_id: toolMessage.tool_call_id ?? toolMessage.id,
        output,
      },
    ] as ResponseInputItem[]
  }

  if (
    message.role === 'assistant' &&
    (message as any).tool_calls &&
    (message as any).tool_calls.length > 0
  ) {
    return (message as any).tool_calls.map(
      (tc: any) =>
        ({
          type: 'function_call',
          id: tc.id,
          call_id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        }) as ResponseInputItem,
    )
  }

  const contentBlocks =
    message.content as OpenAI.Beta.Threads.Messages.TextContentBlock[]
  const text = contentBlocks.map((c) => c.text.value).join('\n')

  if (message.role === 'assistant') {
    return [
      {
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text,
          },
        ],
        status: 'completed',
        type: 'message',
      },
    ] as ResponseInputItem[]
  }

  return [
    {
      role: message.role as 'user' | 'system' | 'developer',
      content: [
        {
          type: 'input_text',
          text,
        },
      ],
      type: 'message',
    },
  ] as ResponseInputItem[]
}
