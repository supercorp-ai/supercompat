import * as crud from './crud'
import * as runLifecycle from './run-lifecycle'
import * as toolCalls from './tool-calls'
import * as dataIntegrity from './data-integrity'

export const contracts = {
  // Group 1: CRUD (deterministic, no model)
  'crud: create assistant': crud.createAssistant,
  'crud: retrieve assistant': crud.retrieveAssistant,
  'crud: update assistant': crud.updateAssistant,
  'crud: list assistants': crud.listAssistants,
  'crud: delete assistant': crud.deleteAssistant,
  'crud: create thread': crud.createThread,
  'crud: retrieve thread': crud.retrieveThread,
  'crud: update thread': crud.updateThread,
  'crud: create message': crud.createMessage,
  'crud: list messages': crud.listMessages,
  'crud: retrieve message': crud.retrieveMessage,

  // Group 2: Run lifecycle (simple, no tools)
  'run: simple poll': runLifecycle.simpleRunPoll,
  'run: simple stream': runLifecycle.simpleRunStream,
  'run: multi-turn conversation': runLifecycle.multiTurnConversation,

  // Group 3: Tool calls
  'tools: round-trip poll': toolCalls.toolCallRoundTripPoll,
  'tools: round-trip stream': toolCalls.toolCallRoundTripStream,
  'tools: output preserved in step': toolCalls.toolOutputPreserved,
  'tools: continue after tool call': toolCalls.continueAfterToolCall,
  'tools: file search': toolCalls.fileSearchCall,
  'tools: parallel tool calls': toolCalls.parallelToolCalls,
  'tools: no-argument tool': toolCalls.noArgToolCall,
  'tools: complex arguments': toolCalls.complexArgsToolCall,
  'tools: code interpreter': toolCalls.codeInterpreterCall,
  'tools: multiple rounds': toolCalls.multipleToolCallRounds,

  // Group 4: Data integrity
  'data: metadata round-trip': dataIntegrity.metadataRoundTrip,
  'data: message content preserved': dataIntegrity.messageContentPreserved,
  'data: run_id on message': dataIntegrity.runIdOnMessage,
  'data: thread_id consistency': dataIntegrity.threadIdConsistency,
  'data: message-step linkage': dataIntegrity.messageStepLinkage,
  'data: list order desc': dataIntegrity.listOrderDesc,
  'data: list order asc': dataIntegrity.listOrderAsc,
  'data: pagination with cursor': dataIntegrity.paginationWithCursor,
  'data: empty thread messages': dataIntegrity.emptyThreadMessages,
  'data: run retrieve after completion': dataIntegrity.runRetrieveAfterCompletion,
  'data: stream delta accumulation': dataIntegrity.streamDeltaAccumulation,
  'data: cancel run': dataIntegrity.cancelRun,
  'data: special chars in tool output': dataIntegrity.specialCharsInToolOutput,
}
