import type OpenAI from 'openai'
import { MessageWithRun } from '@/types'
import { isArray, isObject } from 'radash'

const validToolCallContentTypes = [
  'image',
  'text',
]

const serializeToolContent = ({
  toolCall,
}: {
  toolCall: OpenAI.Beta.Threads.Runs.Steps.FunctionToolCall
}) => {
  if (isArray(toolCall.function.output)) {
    const isEveryToolPartValid = toolCall.function.output.every((toolPart) => {
      if (!isObject(toolPart)) return false

      return validToolCallContentTypes.includes((toolPart as any).type)
    })

    if (isEveryToolPartValid) {
      return toolCall.function.output
    }

    return JSON.stringify(toolCall.function.output)
  }

  return toolCall.function.output ?? ''
}

const serializeToolCall = ({
  toolCall,
}: {
  toolCall: OpenAI.Beta.Threads.Runs.Steps.FunctionToolCall
}): OpenAI.ChatCompletionMessageParam => ({
  tool_call_id: toolCall.id,
  role: 'tool' as 'tool',
  content: serializeToolContent({
    toolCall,
  }),
})

const serializeMessageWithContent = ({
  message,
}: {
  message: MessageWithRun
}): OpenAI.ChatCompletionMessageParam => ({
  role: message.role,
  content: serializeContent({
    content: message.content as unknown as OpenAI.Beta.Threads.Messages.TextContentBlock[],
  }),
  ...((message.role === 'assistant' && (message as any)?.metadata?.toolCalls)
    ? { tool_calls: (message as any).metadata.toolCalls }
    : {}),
})

const serializeContent = ({
  content,
}: {
  content: OpenAI.Beta.Threads.Messages.TextContentBlock[]
}) => content.map((content) => content.text.value).join('\n')

export const serializeMessage = ({
  message
}: {
  message: MessageWithRun
}) => {
  const result: OpenAI.ChatCompletionMessageParam[] = [
    serializeMessageWithContent({ message }) as OpenAI.ChatCompletionMessageParam,
  ]

  const run = message.run

  if (!run) return result

  const messageToolCalls: any[] = Array.isArray((message as any)?.metadata?.toolCalls)
    ? ((message as any).metadata.toolCalls as any[])
    : []

  messageToolCalls.forEach((tc: OpenAI.Beta.Threads.Runs.Steps.ToolCall) => {
    const runStep = run.runSteps.find((rs) => {
      if (rs.type !== 'tool_calls') return false

      const stepDetails = rs.step_details as any
      return stepDetails.tool_calls.some((rsTc: OpenAI.Beta.Threads.Runs.Steps.ToolCall) => {
        if (rsTc.type !== 'function') return false

        return rsTc.id === tc.id
      })
    })

    if (!runStep) return

    const stepDetails = runStep.step_details as any
    const toolCall = stepDetails.tool_calls.find((rsTc: OpenAI.Beta.Threads.Runs.Steps.ToolCall) => {
      if (rsTc.type !== 'function') return false

      return rsTc.id === tc.id
    })

    result.push(serializeToolCall({ toolCall }))
  })

  return result
}
