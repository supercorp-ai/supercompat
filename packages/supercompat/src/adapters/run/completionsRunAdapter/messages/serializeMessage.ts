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

      return validToolCallContentTypes.includes(
        (toolPart as { type?: string }).type ?? '',
      )
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
}) => ({
  tool_call_id: toolCall.id,
  role: 'tool' as 'tool',
  name: toolCall.function.name,
  content: serializeToolContent({
    toolCall,
  }),
})

const serializeMessageWithContent = ({
  message,
}: {
  message: MessageWithRun
}): OpenAI.ChatCompletionMessageParam => {
  const content = serializeContent({
    content: message.content as unknown as OpenAI.Beta.Threads.Messages.TextContentBlock[],
  })

  if (message.role === 'assistant' && message.metadata?.toolCalls) {
    return {
      role: 'assistant',
      content,
      tool_calls: message.metadata
        .toolCalls as OpenAI.ChatCompletionMessageToolCall[],
    }
  }

  return {
    role: message.role,
    content,
  }
}

const serializeContent = ({
  content,
}: {
  content: OpenAI.Beta.Threads.Messages.TextContentBlock[]
}) => content.map((content) => content.text.value).join('\n')

export const serializeMessage = ({
  message,
}: {
  message: MessageWithRun
}): OpenAI.ChatCompletionMessageParam[] => {
  const result: OpenAI.ChatCompletionMessageParam[] = [
    serializeMessageWithContent({ message }),
  ]

  const run = message.run

  if (!run) return result

  const messageToolCalls = Array.isArray(message.metadata?.toolCalls)
    ? (message.metadata?.toolCalls as OpenAI.Beta.Threads.Runs.Steps.ToolCall[])
    : undefined

  ;(messageToolCalls || []).forEach((tc) => {
      const runStep = run.runSteps.find((rs) => {
        if (rs.type !== 'tool_calls') return false

        return (
          (rs.step_details as OpenAI.Beta.Threads.Runs.Steps.ToolCallsStepDetails).tool_calls.some(
            (rsTc: OpenAI.Beta.Threads.Runs.Steps.ToolCall) => {
              if (rsTc.type !== 'function') return false

              return rsTc.id === tc.id
            }
          )
        )
      })

      if (!runStep) return

      const toolCall = (
        (runStep.step_details as OpenAI.Beta.Threads.Runs.Steps.ToolCallsStepDetails).tool_calls.find(
          (rsTc: OpenAI.Beta.Threads.Runs.Steps.ToolCall) => {
            if (rsTc.type !== 'function') return false

            return rsTc.id === tc.id
          }
        )
      ) as OpenAI.Beta.Threads.Runs.Steps.FunctionToolCall

      result.push(serializeToolCall({ toolCall }))
    })

  return result
}
