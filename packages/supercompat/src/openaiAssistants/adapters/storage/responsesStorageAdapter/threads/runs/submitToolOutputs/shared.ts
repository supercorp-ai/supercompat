import type { OpenAI } from 'openai'
import { serializeComputerUseTool } from '@/lib/openaiComputerUse'

const computerCallOutput = ({
  toolOutput,
}: {
  toolOutput: OpenAI.Beta.Threads.RunSubmitToolOutputsParams['tool_outputs'][number]
}) => {
  let parsedOutput

  if (typeof toolOutput.output === 'string') {
    try {
      parsedOutput = JSON.parse(toolOutput.output)
    } catch {
      return { isComputerCallOutput: false }
    }
  } else if (typeof toolOutput.output === 'object' && toolOutput.output !== null) {
    parsedOutput = toolOutput.output
  } else {
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
  useOpenaiComputerTool,
}: {
  tools: OpenAI.Beta.Threads.Runs.RunCreateParams['tools']
  useOpenaiComputerTool: boolean
}) => {
  if (!tools?.length) return {}

  return {
    tools: tools.map((tool) => {
      const toolType = (tool as any).type
      if (toolType === 'computer' || toolType === 'computer_use_preview') {
        const serialized = serializeComputerUseTool({
          useOpenaiComputerTool,
          tool: tool as unknown as Record<string, unknown>,
        })
        // Flatten nested Assistants format → flat Responses API format
        if (serialized.type === 'computer') {
          return { type: 'computer' as const }
        }
        const config = (serialized as any).computer_use_preview ?? {}
        return { type: 'computer_use_preview' as const, ...config }
      }
      return {
        type: tool.type,
        // @ts-ignore-next-line
        ...(tool[tool.type] || {}),
      }
    })
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
