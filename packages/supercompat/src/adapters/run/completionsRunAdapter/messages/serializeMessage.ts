import type OpenAI from 'openai'
import { MessageWithRun } from '@/types'

const serializeToolCall = ({
  toolCall,
}: {
  toolCall: OpenAI.Beta.Threads.Runs.Steps.FunctionToolCall
}) => ({
  tool_call_id: toolCall.id,
  role: 'tool' as 'tool',
  name: toolCall.function.name,
  content: toolCall.function.output ?? '',
})

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
  const result = [serializeMessageWithContent({ message })]

  const run = message.run

  if (!run) return result

  const messageToolCalls = message.metadata?.toolCalls || []

  messageToolCalls.forEach((tc: OpenAI.Beta.Threads.Runs.Steps.ToolCall) => {
    const runStep = run.runSteps.find((rs) => {
      if (rs.type !== 'tool_calls') return false

      return rs.step_details.tool_calls.some((rsTc: OpenAI.Beta.Threads.Runs.Steps.ToolCall) => {
        if (rsTc.type !== 'function') return false

        return rsTc.id === tc.id
      })
    })

    if (!runStep) return

    const toolCall = runStep.step_details.tool_calls.find((rsTc: OpenAI.Beta.Threads.Runs.Steps.ToolCall) => {
      if (rsTc.type !== 'function') return false

      return rsTc.id === tc.id
    })

    result.push(serializeToolCall({ toolCall }))
  })

  return result
}
