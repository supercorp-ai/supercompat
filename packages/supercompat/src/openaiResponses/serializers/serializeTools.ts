import { serializeComputerUseTool } from '../../openaiAssistants/lib/openaiComputerUse'

type ToolWithRelations = {
  id: string
  type: string
  functionTool?: {
    name: string
    description: string | null
    parameters: any
    strict: boolean
  } | null
  fileSearchTool?: {
    vectorStoreIds: string[]
    maxNumResults: number
  } | null
  webSearchTool?: {} | null
  codeInterpreterTool?: {} | null
  computerUseTool?: {
    displayHeight: number
    displayWidth: number
    environment: string
  } | null
}

const serializeTool = ({
  tool,
  useOpenaiComputerTool,
}: {
  tool: ToolWithRelations
  useOpenaiComputerTool: boolean
}) => {
  switch (tool.type) {
    case 'FUNCTION':
      return {
        type: 'function' as const,
        name: tool.functionTool?.name ?? '',
        description: tool.functionTool?.description ?? undefined,
        parameters: tool.functionTool?.parameters ?? {},
        strict: tool.functionTool?.strict ?? false,
      }
    case 'FILE_SEARCH':
      return {
        type: 'file_search' as const,
        vector_store_ids: tool.fileSearchTool?.vectorStoreIds ?? [],
        max_num_results: tool.fileSearchTool?.maxNumResults ?? 20,
      }
    case 'WEB_SEARCH':
      return {
        type: 'web_search_preview' as const,
      }
    case 'CODE_INTERPRETER':
      return {
        type: 'code_interpreter' as const,
      }
    case 'COMPUTER_USE':
      return serializeComputerUseTool({
        useOpenaiComputerTool,
        tool: {
          display_height: tool.computerUseTool?.displayHeight ?? 720,
          display_width: tool.computerUseTool?.displayWidth ?? 1280,
          environment: tool.computerUseTool?.environment ?? 'linux',
        },
      })
    default:
      return { type: tool.type.toLowerCase() }
  }
}

export const serializeTools = ({
  tools,
  useOpenaiComputerTool,
}: {
  tools: ToolWithRelations[]
  useOpenaiComputerTool: boolean
}) => tools.map((tool) => serializeTool({ tool, useOpenaiComputerTool }))
