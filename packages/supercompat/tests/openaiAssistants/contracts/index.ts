import * as crud from './crud'
import * as runLifecycle from './run-lifecycle'
import * as toolCalls from './tool-calls'
import * as dataIntegrity from './data-integrity'

// Full Assistants API CRUD (baseline + prisma adapter only)
export const assistantCrudContracts = {
  'crud: create assistant': crud.createAssistant,
  'crud: retrieve assistant': crud.retrieveAssistant,
  'crud: update assistant': crud.updateAssistant,
  'crud: list assistants': crud.listAssistants,
  'crud: delete assistant': crud.deleteAssistant,
}

// Thread/message CRUD that requires immediate storage
// (Responses adapter defers message storage until a run starts)
export const immediateCrudContracts = {
  'crud: create thread': crud.createThread,
  'crud: retrieve thread': crud.retrieveThread,
  'crud: update thread': crud.updateThread,
  'crud: retrieve message': crud.retrieveMessage,
  'crud: create message': crud.createMessage,
  'crud: list messages': crud.listMessages,
  'crud: update message': crud.updateMessage,
  'crud: delete message': crud.deleteMessage,
  'data: message content preserved': dataIntegrity.messageContentPreserved,
  'data: list order desc': dataIntegrity.listOrderDesc,
  'data: list order asc': dataIntegrity.listOrderAsc,
  // Cursor pagination requires sequential IDs for deterministic ordering.
  // Prisma adapter uses UUIDs, so messages with the same timestamp may sort differently.
  'data: pagination with cursor': dataIntegrity.paginationWithCursor,
  'data: pagination with before cursor': dataIntegrity.paginationWithBeforeCursor,
  'data: empty thread messages': dataIntegrity.emptyThreadMessages,
}

// Immediate CRUD for adapters that use UUIDs (no deterministic cursor pagination).
// Excludes ordering-sensitive tests — UUID v4 IDs + millisecond timestamps can't
// guarantee deterministic order for messages created in rapid succession.
export const immediateCrudContractsUUID = {
  'crud: create thread': crud.createThread,
  'crud: retrieve thread': crud.retrieveThread,
  'crud: update thread': crud.updateThread,
  'crud: retrieve message': crud.retrieveMessage,
  'crud: create message': crud.createMessage,
  'crud: update message': crud.updateMessage,
  'crud: delete message': crud.deleteMessage,
  'data: message content preserved': dataIntegrity.messageContentPreserved,
  'data: pagination with before cursor': dataIntegrity.paginationWithBeforeCursor,
  'data: empty thread messages': dataIntegrity.emptyThreadMessages,
}

// Contracts that use submitToolOutputsAndPoll (requires mutable run state).
// The Responses adapter can't support this — each submit creates a new
// immutable response. Use streaming submitToolOutputs instead.
export const pollToolContracts = {
  'tools: round-trip poll': toolCalls.toolCallRoundTripPoll,
  'tools: output preserved in step': toolCalls.toolOutputPreserved,
  'tools: continue after tool call': toolCalls.continueAfterToolCall,
  'tools: parallel tool calls': toolCalls.parallelToolCalls,
  'tools: no-argument tool': toolCalls.noArgToolCall,
  'tools: complex arguments': toolCalls.complexArgsToolCall,
  'tools: multiple rounds': toolCalls.multipleToolCallRounds,
  'data: cancel run': dataIntegrity.cancelRun,
  'data: special chars in tool output': dataIntegrity.specialCharsInToolOutput,
}

// Core contracts that work with the Responses adapter
export const coreContracts = {
  // Run lifecycle
  'run: simple poll': runLifecycle.simpleRunPoll,
  'run: simple stream': runLifecycle.simpleRunStream,
  'run: multi-turn conversation': runLifecycle.multiTurnConversation,
  'run: runs list': runLifecycle.runsList,
  'run: create thread and run': runLifecycle.createThreadAndRun,
  'run: create and run stream': runLifecycle.createAndRunStream,
  'run: stream helper': runLifecycle.runStreamHelper,
  'run: submit tool outputs stream': runLifecycle.submitToolOutputsStream,

  // Tool calls (streaming)
  'tools: round-trip stream': toolCalls.toolCallRoundTripStream,
  'tools: file search': toolCalls.fileSearchCall,
  'tools: file search message attachment': toolCalls.fileSearchMessageAttachment,
  'tools: code interpreter': toolCalls.codeInterpreterCall,

  // Data integrity (after runs — messages exist in conversation)
  'data: metadata round-trip': dataIntegrity.metadataRoundTrip,
  'data: run_id on message': dataIntegrity.runIdOnMessage,
  'data: thread_id consistency': dataIntegrity.threadIdConsistency,
  'data: message-step linkage': dataIntegrity.messageStepLinkage,
  'data: run retrieve after completion': dataIntegrity.runRetrieveAfterCompletion,
  'data: stream delta accumulation': dataIntegrity.streamDeltaAccumulation,
  'data: models list': dataIntegrity.modelsList,
  'data: run step retrieve': dataIntegrity.runStepRetrieve,
  'data: run update': dataIntegrity.runUpdate,
  'data: file search annotation indexes': dataIntegrity.fileSearchAnnotationIndexes,
  'data: run failure error details': dataIntegrity.runFailureErrorDetails,
  'data: tool call steps persist after reload': dataIntegrity.toolCallStepsPersistAfterReload,
  'errors: invalid thread': dataIntegrity.invalidThreadError,
  'errors: invalid assistant run': dataIntegrity.invalidAssistantRunError,
}

// Contracts for completions-based adapters (prisma + completionsRunAdapter).
// Excludes:
// - file_search, code_interpreter (not supported by Chat Completions API)
// - Stream event order checks (completions adapter emits thread.run.in_progress, not thread.run.created)
// - Usage assertions (completions adapter doesn't track token usage)
export const completionsContracts = {
  ...assistantCrudContracts,
  ...immediateCrudContractsUUID,
  // Run lifecycle (simpleRunPoll excluded — checks usage which completions adapter doesn't track)
  'run: simple stream': runLifecycle.simpleRunStream,
  'run: multi-turn conversation': runLifecycle.multiTurnConversation,
  'run: runs list': runLifecycle.runsList,
  'run: create thread and run': runLifecycle.createThreadAndRun,
  'run: create and run stream': runLifecycle.createAndRunStream,
  'run: stream helper': runLifecycle.runStreamHelper,
  'run: submit tool outputs stream': runLifecycle.submitToolOutputsStream,
  // Data integrity (after runs)
  'data: metadata round-trip': dataIntegrity.metadataRoundTrip,
  'data: stream delta accumulation': dataIntegrity.streamDeltaAccumulation,
  'data: models list': dataIntegrity.modelsList,
  'data: run step retrieve': dataIntegrity.runStepRetrieve,
  'data: run update': dataIntegrity.runUpdate,
  'data: run_id on message': dataIntegrity.runIdOnMessage,
  'data: thread_id consistency': dataIntegrity.threadIdConsistency,
  'data: message-step linkage': dataIntegrity.messageStepLinkage,
  'data: run retrieve after completion': dataIntegrity.runRetrieveAfterCompletion,
  // Tool calls (function tools only, excluding round-trip poll which checks usage)
  'tools: output preserved in step': toolCalls.toolOutputPreserved,
  'tools: continue after tool call': toolCalls.continueAfterToolCall,
  'tools: parallel tool calls': toolCalls.parallelToolCalls,
  'tools: no-argument tool': toolCalls.noArgToolCall,
  'tools: complex arguments': toolCalls.complexArgsToolCall,
  'tools: multiple rounds': toolCalls.multipleToolCallRounds,
  'data: cancel run': dataIntegrity.cancelRun,
  'data: special chars in tool output': dataIntegrity.specialCharsInToolOutput,
  'data: run failure error details': dataIntegrity.runFailureErrorDetails,
  'data: tool call steps persist after reload': dataIntegrity.toolCallStepsPersistAfterReload,
  'errors: invalid thread': dataIntegrity.invalidThreadError,
  'errors: invalid assistant run': dataIntegrity.invalidAssistantRunError,
}

// Contracts for providers that don't support function calling (e.g. Perplexity).
// Only CRUD, run lifecycle, and data integrity — no tool call contracts.
export const noToolsContracts = {
  ...assistantCrudContracts,
  ...immediateCrudContractsUUID,
  'run: multi-turn conversation': runLifecycle.multiTurnConversation,
  'run: runs list': runLifecycle.runsList,
  'run: create thread and run': runLifecycle.createThreadAndRun,
  'data: metadata round-trip': dataIntegrity.metadataRoundTrip,
  'data: models list': dataIntegrity.modelsList,
  'data: run update': dataIntegrity.runUpdate,
  'data: run_id on message': dataIntegrity.runIdOnMessage,
  'data: thread_id consistency': dataIntegrity.threadIdConsistency,
  'data: message-step linkage': dataIntegrity.messageStepLinkage,
  'data: run retrieve after completion': dataIntegrity.runRetrieveAfterCompletion,
}

// All contracts (baseline only — the real Assistants API supports everything)
export const contracts = {
  ...assistantCrudContracts,
  ...immediateCrudContracts,
  ...coreContracts,
  ...pollToolContracts,
}
