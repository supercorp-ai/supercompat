import type OpenAI from 'openai'
import { MessageWithRun } from '@/types'

const serializeToolCall = ({
  toolCall,
}: {
  toolCall: OpenAI.Beta.Threads.Runs.Steps.FunctionToolCall
}) => ({
  role: 'user' as 'user',
  content: [
    {
      type: 'tool_result',
      tool_use_id: toolCall.id,
      content: toolCall.function.output ?? '',
    },
  ],
})

const serializeInputToolCall = ({
  toolCall,
}: {
  toolCall: OpenAI.Beta.Threads.Runs.Steps.FunctionToolCall
}) => ({
  type: 'tool_use',
  id: toolCall.id,
  name: toolCall.function.name,
  input: JSON.parse(toolCall.function.arguments),
})

const serializeMessageWithContent = ({
  message,
}: {
  message: MessageWithRun
}) => ({
  role: message.role,
  content: [
    {
      type: 'text',
      text: serializeContent({
        content: message.content as unknown as OpenAI.Beta.Threads.Messages.TextContentBlock[],
      }),
    },
    // @ts-ignore-next-line
    ...(message?.metadata?.toolCalls ?? []).map((toolCall: OpenAI.Beta.Threads.Runs.Steps.FunctionToolCall) => (
      serializeInputToolCall({
        toolCall,
      })
    )),
  ],
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

  // @ts-ignore-next-line
  const messageToolCalls = message.metadata?.toolCalls || []

  messageToolCalls.forEach((tc: OpenAI.Beta.Threads.Runs.Steps.ToolCall) => {
    const runStep = run.runSteps.find((rs) => {
      if (rs.type !== 'tool_calls') return false

      // @ts-ignore-next-line
      return rs.step_details.tool_calls.some((rsTc: OpenAI.Beta.Threads.Runs.Steps.ToolCall) => {
        if (rsTc.type !== 'function') return false

        return rsTc.id === tc.id
      })
    })

    if (!runStep) return

    // @ts-ignore-next-line
    const toolCall = runStep.step_details.tool_calls.find((rsTc: OpenAI.Beta.Threads.Runs.Steps.ToolCall) => {
      if (rsTc.type !== 'function') return false

      return rsTc.id === tc.id
    })

    result.push(serializeToolCall({ toolCall }))
  })

  return result
}
