import type OpenAI from 'openai'
import { MessageWithRun } from '@/types'
import { isArray, isObject } from 'radash'

type ToolCall = OpenAI.Beta.Threads.Runs.Steps.ToolCall

const validToolCallContentTypes = [
  'image',
  'image_url',
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
}) => ({
  tool_call_id: toolCall.id,
  role: 'tool' as 'tool',
  name: toolCall.function.name,
  content: serializeToolContent({
    toolCall,
  }),
}) as OpenAI.ChatCompletionToolMessageParam

const serializeMessageWithContent = ({
  message,
}: {
  message: MessageWithRun
}) => ({
  role: message.role,
  content: serializeContent({
    content: message.content as unknown as OpenAI.Beta.Threads.Messages.TextContentBlock[],
  }),
  ...(message?.metadata?.toolCalls ? { tool_calls: message.metadata.toolCalls } : {}),
}) as OpenAI.ChatCompletionMessageParam

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
  const result = [serializeMessageWithContent({ message })] as OpenAI.ChatCompletionMessageParam[]

  const run = message.run

  if (!run) return result

  const messageToolCalls = (message.metadata?.toolCalls || []) as OpenAI.Beta.Threads.Runs.Steps.ToolCall[]

  messageToolCalls.forEach((tc: OpenAI.Beta.Threads.Runs.Steps.ToolCall) => {
    const runStep = run.runSteps.find((rs) => {
      if (rs.type !== 'tool_calls') return false
      const stepDetails = rs.step_details as { tool_calls?: ToolCall[] }
      if (!Array.isArray(stepDetails.tool_calls)) return false

      return stepDetails.tool_calls.some((rsTc: ToolCall) => rsTc.type === 'function' && rsTc.id === tc.id)
    })

    if (!runStep) return

    const stepDetails = runStep.step_details as { tool_calls?: ToolCall[] }
    if (!Array.isArray(stepDetails.tool_calls)) return

    const toolCall = stepDetails.tool_calls.find((rsTc: ToolCall) => rsTc.type === 'function' && rsTc.id === tc.id)

    if (toolCall && toolCall.type === 'function') {
      result.push(serializeToolCall({ toolCall }))
    }
  })

  return result
}
