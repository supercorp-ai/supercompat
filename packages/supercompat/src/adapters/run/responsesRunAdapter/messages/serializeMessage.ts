import type OpenAI from 'openai'
import { MessageWithRun } from '@/types'

export const serializeMessage = ({
  message,
}: {
  message: MessageWithRun
}) => {
  const contentBlocks = message.content as unknown as OpenAI.Beta.Threads.Messages.TextContentBlock[]
  const text = contentBlocks.map((c) => c.text.value).join('\n')

  if ((message as any).role === 'tool') {
    const output = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
    return [
      {
        type: 'function_call_output',
        call_id: (message as any).tool_call_id ?? message.id,
        output,
      },
    ]
  }

  if (message.role === 'assistant') {
    return [
      {
        id: message.id,
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
    ]
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
  ]
}
