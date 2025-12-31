import type { OpenAI } from 'openai'

const computerCallOutput = ({
  toolOutput,
}: {
  toolOutput: OpenAI.Beta.Threads.RunSubmitToolOutputsParams['tool_outputs'][number]
}) => {
  if (typeof toolOutput.output !== 'string') return { isComputerCallOutput: false }

  let parsedOutput

  try {
    parsedOutput = JSON.parse(toolOutput.output)
  } catch {
    return { isComputerCallOutput: false }
  }

  if (typeof parsedOutput !== 'object' || parsedOutput === null) return { isComputerCallOutput: false }
  if (parsedOutput.type !== 'computer_screenshot') return { isComputerCallOutput: false }

  return {
    isComputerCallOutput: true,
    parsedOutput,
  }
}

export const getToolCallOutputItems = ({
  tool_outputs,
}: {
  tool_outputs: OpenAI.Beta.Threads.RunSubmitToolOutputsParams['tool_outputs']
}) => {
  const functionCallOutputItems: Omit<OpenAI.Responses.ResponseFunctionToolCallOutputItem, 'id'>[] = []
  const computerCallOutputItems: Omit<OpenAI.Responses.ResponseComputerToolCallOutputItem, 'id'>[] = []

  tool_outputs.forEach((toolOutput) => {
    const { isComputerCallOutput, parsedOutput } = computerCallOutput({ toolOutput })

    if (isComputerCallOutput) {
      computerCallOutputItems.push({
        type: 'computer_call_output' as const,
        call_id: toolOutput.tool_call_id!,
        output: parsedOutput,
        // @ts-expect-error compat
        acknowledged_safety_checks: toolOutput.acknowledged_safety_checks ?? [],
      })
    } else {
      functionCallOutputItems.push({
        type: 'function_call_output' as const,
        call_id: toolOutput.tool_call_id!,
        output: toolOutput.output ?? '',
      })
    }
  })

  return {
    functionCallOutputItems,
    computerCallOutputItems,
  }
}

export const serializeTools = ({
  tools,
}: {
  tools: OpenAI.Beta.Threads.Runs.RunCreateParams['tools']
}) => {
  if (!tools?.length) return {}

  return {
    tools: tools.map((tool) => ({
      type: tool.type,
      // @ts-ignore-next-line
      ...(tool[tool.type] || {}),
    }))
  }
}

export const truncation = ({
  openaiAssistant,
}: {
  openaiAssistant: any
}) => {
  if (openaiAssistant.truncation_strategy?.type === 'disabled') {
    return 'disabled'
  }

  return 'auto'
}
