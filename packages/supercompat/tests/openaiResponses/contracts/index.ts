import * as crud from './crud'
import * as streaming from './streaming'
import * as tools from './tools'
import * as builtinTools from './builtin-tools'
import * as conversations from './conversations'
import * as params from './params'

export const responsesCrudContracts = {
  'crud: create response': crud.createResponse,
  'crud: retrieve response': crud.retrieveResponse,
  'crud: delete response': crud.deleteResponse,
  'crud: cancel response': crud.cancelResponse,
  'crud: stream helper': crud.streamHelper,
}

export const responsesStreamingContracts = {
  'streaming: response stream': streaming.streamResponse,
  'streaming: delta accumulation': streaming.streamDeltaAccumulation,
  'streaming: previous_response_id chaining': streaming.previousResponseIdChaining,
  'streaming: include param': streaming.includeParam,
}

export const responsesToolsContracts = {
  'tools: function call': tools.functionCall,
  'tools: function call round-trip': tools.functionCallRoundTrip,
  'tools: parallel function calls': tools.parallelFunctionCalls,
}

export const responsesConversationsContracts = {
  'conversations: create': conversations.createConversation,
  'conversations: retrieve': conversations.retrieveConversation,
  'conversations: update': conversations.updateConversation,
  'conversations: multi-turn': conversations.conversationMultiTurn,
  'conversations: input items': conversations.conversationInputItems,
  'conversations: item create': conversations.conversationItemCreate,
  'conversations: item retrieve': conversations.conversationItemRetrieve,
  'conversations: item delete': conversations.conversationItemDelete,
}

export const responsesBuiltinToolsContracts = {
  'builtin-tools: web search': builtinTools.webSearch,
  'builtin-tools: file search': builtinTools.fileSearch,
  'builtin-tools: file input inline': builtinTools.fileInputInline,
  'builtin-tools: code interpreter': builtinTools.codeInterpreter,
  'builtin-tools: computer use': builtinTools.computerUse,
}

export const responsesParamsContracts = {
  'params: structured output': params.structuredOutput,
  'params: tool_choice': params.toolChoice,
  'params: truncation auto': params.truncationAuto,
  'params: max_output_tokens': params.maxOutputTokens,
  'params: temperature': params.temperatureParam,
}

export const responsesContracts = {
  ...responsesCrudContracts,
  ...responsesStreamingContracts,
  ...responsesToolsContracts,
  ...responsesBuiltinToolsContracts,
  ...responsesConversationsContracts,
  ...responsesParamsContracts,
}
