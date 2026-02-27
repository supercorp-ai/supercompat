import type { PrismaClient } from '@prisma/client'
import type { MessageWithRun } from '@/types'
import dayjs from 'dayjs'

const makeMessage = (overrides: Partial<MessageWithRun> & { role: string; content: any }): MessageWithRun => ({
  id: 'input',
  object: 'thread.message',
  thread_id: '',
  created_at: dayjs().unix(),
  completed_at: null,
  incomplete_at: null,
  incomplete_details: null,
  assistant_id: null,
  run_id: null,
  attachments: [],
  status: 'completed',
  metadata: {},
  run: null,
  ...overrides,
} as MessageWithRun)

export const getMessages = ({
  prisma,
  conversationId,
  input,
  truncationLastMessagesCount,
}: {
  prisma: PrismaClient
  conversationId: string | null
  input: any
  truncationLastMessagesCount: number | null
}) => async (): Promise<MessageWithRun[]> => {
  const messages: MessageWithRun[] = []

  if (conversationId) {
    const previousResponses = await prisma.response.findMany({
      where: {
        conversationId,
        status: { in: ['COMPLETED', 'INCOMPLETE'] },
      },
      include: {
        outputItems: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    })

    // Collect all responses and their inputs to pair function calls with outputs
    const allInputs: { responseIndex: number; items: any[] }[] = previousResponses.map((r, i) => ({
      responseIndex: i,
      items: normalizeInput(r.input),
    }))

    for (let i = 0; i < previousResponses.length; i++) {
      const response = previousResponses[i]
      const responseInput = normalizeInput(response.input)

      // Add user messages from input (skip function_call_output — handled separately)
      for (const item of responseInput) {
        if (item.type === 'function_call_output') continue
        messages.push(inputItemToMessage(item))
      }

      // Collect output items
      const messageItems = response.outputItems.filter((oi: any) => oi.type === 'MESSAGE')
      const functionCalls = response.outputItems.filter((oi: any) => oi.type === 'FUNCTION_CALL')

      // Add assistant message output
      for (const msgItem of messageItems) {
        const content = msgItem.content as any[]
        const text = (content ?? [])
          .filter((c: any) => c.type === 'output_text')
          .map((c: any) => c.text)
          .join('\n')

        // If there are function calls, include them as tool_calls
        const toolCallsMeta = functionCalls.length > 0
          ? functionCalls.map((fc: any) => ({
              id: fc.callId,
              type: 'function',
              function: {
                name: fc.name,
                arguments: fc.arguments ?? '',
              },
            }))
          : undefined

        // Find tool outputs from the next response's input (or current input)
        const nextInputItems = i + 1 < previousResponses.length
          ? normalizeInput(previousResponses[i + 1].input)
          : normalizeInput(input)

        const toolOutputs = nextInputItems.filter((it: any) => it.type === 'function_call_output')

        // Build runSteps with tool call outputs
        const runSteps = toolCallsMeta && toolOutputs.length > 0
          ? [{
              id: 'virtual-step',
              object: 'thread.run.step',
              run_id: '',
              assistant_id: '',
              thread_id: '',
              type: 'tool_calls',
              status: 'completed',
              created_at: dayjs().unix(),
              expired_at: null,
              cancelled_at: null,
              failed_at: null,
              completed_at: dayjs().unix(),
              last_error: null,
              metadata: {},
              usage: null,
              step_details: {
                type: 'tool_calls',
                tool_calls: functionCalls.map((fc: any) => {
                  const output = toolOutputs.find((to: any) => to.call_id === fc.callId)
                  return {
                    id: fc.callId,
                    type: 'function',
                    function: {
                      name: fc.name,
                      arguments: fc.arguments ?? '',
                      output: output?.output ?? null,
                    },
                  }
                }),
              },
            }]
          : []

        messages.push(makeMessage({
          id: msgItem.id,
          role: 'assistant',
          content: [{ type: 'text', text: { value: text, annotations: [] } }],
          created_at: dayjs(msgItem.createdAt).unix(),
          metadata: toolCallsMeta ? { toolCalls: toolCallsMeta } : {},
          run: toolCallsMeta ? {
            id: 'virtual-run',
            object: 'thread.run',
            thread_id: '',
            assistant_id: '',
            status: 'completed',
            created_at: dayjs().unix(),
            expires_at: 0,
            started_at: null,
            cancelled_at: null,
            failed_at: null,
            completed_at: null,
            model: '',
            instructions: '',
            tools: [],
            metadata: {},
            usage: null,
            truncation_strategy: { type: 'auto', last_messages: null },
            response_format: 'auto',
            incomplete_details: null,
            max_completion_tokens: null,
            max_prompt_tokens: null,
            temperature: null,
            top_p: null,
            tool_choice: 'auto',
            parallel_tool_calls: true,
            last_error: null,
            required_action: null,
            runSteps: runSteps,
          } as any : null,
        }))
      }

      // If there are function calls but no message items, create the assistant message
      if (functionCalls.length > 0 && messageItems.length === 0) {
        const nextInputItems = i + 1 < previousResponses.length
          ? normalizeInput(previousResponses[i + 1].input)
          : normalizeInput(input)

        const toolOutputs = nextInputItems.filter((it: any) => it.type === 'function_call_output')

        const toolCallsMeta = functionCalls.map((fc: any) => ({
          id: fc.callId,
          type: 'function',
          function: {
            name: fc.name,
            arguments: fc.arguments ?? '',
          },
        }))

        const runSteps = toolOutputs.length > 0
          ? [{
              id: 'virtual-step',
              object: 'thread.run.step',
              run_id: '',
              assistant_id: '',
              thread_id: '',
              type: 'tool_calls',
              status: 'completed',
              created_at: dayjs().unix(),
              expired_at: null,
              cancelled_at: null,
              failed_at: null,
              completed_at: dayjs().unix(),
              last_error: null,
              metadata: {},
              usage: null,
              step_details: {
                type: 'tool_calls',
                tool_calls: functionCalls.map((fc: any) => {
                  const output = toolOutputs.find((to: any) => to.call_id === fc.callId)
                  return {
                    id: fc.callId,
                    type: 'function',
                    function: {
                      name: fc.name,
                      arguments: fc.arguments ?? '',
                      output: output?.output ?? null,
                    },
                  }
                }),
              },
            }]
          : []

        messages.push(makeMessage({
          role: 'assistant',
          content: [{ type: 'text', text: { value: '', annotations: [] } }],
          metadata: { toolCalls: toolCallsMeta },
          run: {
            id: 'virtual-run',
            object: 'thread.run',
            thread_id: '',
            assistant_id: '',
            status: 'completed',
            created_at: dayjs().unix(),
            expires_at: 0,
            started_at: null,
            cancelled_at: null,
            failed_at: null,
            completed_at: null,
            model: '',
            instructions: '',
            tools: [],
            metadata: {},
            usage: null,
            truncation_strategy: { type: 'auto', last_messages: null },
            response_format: 'auto',
            incomplete_details: null,
            max_completion_tokens: null,
            max_prompt_tokens: null,
            temperature: null,
            top_p: null,
            tool_choice: 'auto',
            parallel_tool_calls: true,
            last_error: null,
            required_action: null,
            runSteps: runSteps,
          } as any,
        }))
      }
    }
  }

  // Add current input items (skip function_call_output — already handled above as tool outputs)
  if (input) {
    const inputItems = normalizeInput(input)
    for (const item of inputItems) {
      if (item.type === 'function_call_output') continue
      messages.push(inputItemToMessage(item))
    }
  }

  if (truncationLastMessagesCount && messages.length > truncationLastMessagesCount) {
    return messages.slice(-truncationLastMessagesCount)
  }

  return messages
}

const normalizeInput = (input: any): any[] => {
  if (!input) return []
  if (typeof input === 'string') return [input]
  if (Array.isArray(input)) return input
  return [input]
}

const inputItemToMessage = (item: any): MessageWithRun => {
  if (typeof item === 'string') {
    return makeMessage({
      role: 'user',
      content: [{ type: 'text', text: { value: item, annotations: [] } }],
    })
  }

  if (item.type === 'message' || item.role) {
    const role = item.role ?? 'user'
    const content = Array.isArray(item.content)
      ? item.content.map((c: any) => {
          if (c.type === 'input_text') {
            return { type: 'text', text: { value: c.text, annotations: [] } }
          }
          return c
        })
      : [{ type: 'text', text: { value: String(item.content ?? ''), annotations: [] } }]

    return makeMessage({ id: item.id ?? 'input', role, content })
  }

  return makeMessage({
    role: 'user',
    content: [{ type: 'text', text: { value: JSON.stringify(item), annotations: [] } }],
  })
}
