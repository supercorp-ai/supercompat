import type OpenAI from 'openai'
import { isEmpty } from 'radash'
import { MessageWithRun } from '@/types'

const serializeToolCalls = ({
  runStep,
}: {
  runStep: OpenAI.Beta.Threads.Runs.RunStep
}) => {
  if (runStep.step_details.type !== 'tool_calls') return []

  const functionToolCalls = runStep.step_details.tool_calls.filter(tc => tc.type === 'function') as OpenAI.Beta.Threads.Runs.Steps.FunctionToolCall[]

  return functionToolCalls.map((toolCall) => ({
    tool_call_id: toolCall.id,
    role: 'tool' as 'tool',
    name: toolCall.function.name,
    content: toolCall.function.output,
  }))
}

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

  if (!message.run) return result
  if (isEmpty(message.metadata?.toolCalls)) return result

  const toolCallsRunSteps = message.run.runSteps.filter((runStep) => runStep.type === 'tool_calls')

  toolCallsRunSteps.forEach((runStep) => {
    result.push(...serializeToolCalls({ runStep }))
  })

  console.dir({ result }, { depth: null })

  return result
}
