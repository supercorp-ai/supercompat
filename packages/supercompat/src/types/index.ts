import type OpenAI from 'openai'

export type MessageWithRun = OpenAI.Beta.Threads.Message & {
  run: (OpenAI.Beta.Threads.Run & {
    runSteps: OpenAI.Beta.Threads.Runs.RunStep[]
  }) | null
}

export interface GetOpenaiAssistantFn {
  (args: { select: { id: true } }):
    | Pick<OpenAI.Beta.Assistants.Assistant, 'id'>
    | Promise<Pick<OpenAI.Beta.Assistants.Assistant, 'id'>>
  (args?: { select?: { id?: false } }):
    | OpenAI.Beta.Assistants.Assistant
    | Promise<OpenAI.Beta.Assistants.Assistant>
}

/**
 * Body shape from Assistants surface storage adapters (prismaStorageAdapter, memoryStorageAdapter).
 * This is a serialized OpenAI Run object — contains both API params and event metadata.
 */
export type AssistantsRunBody = OpenAI.Beta.Threads.Run

/**
 * Body shape from Responses surface storage adapters (prismaStorageAdapter, openaiResponsesStorageAdapter).
 * These are Responses API params — passed directly to client.responses.create() by native adapters,
 * or used by completionsRunAdapter to build a /chat/completions request.
 */
export type ResponsesRunBody = {
  model?: string
  input?: OpenAI.Responses.ResponseInput
  status?: string
  instructions?: string
  tools?: OpenAI.Responses.Tool[]
  tool_choice?: OpenAI.Responses.ResponseCreateParams['tool_choice']
  metadata?: Record<string, string> | null
  temperature?: number
  top_p?: number
  max_output_tokens?: number
  text?: OpenAI.Responses.ResponseTextConfig
  truncation?: OpenAI.Responses.ResponseCreateParams['truncation']
  conversation?: string
  parallel_tool_calls?: boolean
  // Azure agent reference
  agent?: { name: string; type: string }
}

/**
 * Body shape from Azure Agents storage adapter.
 */
export type AzureAgentsRunBody = {
  threadId: string
  assistantId: string
  instructions?: string
  tools?: OpenAI.Beta.Threads.Runs.RunCreateParams['tools']
}

export type RunAdapterBody = AssistantsRunBody | ResponsesRunBody | AzureAgentsRunBody

export type RunAdapterHandleArgs = {
  client: OpenAI
  body: RunAdapterBody
  onEvent: (event: any) => Promise<any>
  getMessages?: () => Promise<MessageWithRun[]>
}

export type RunAdapterHandle = (
  args: RunAdapterHandleArgs,
) => Promise<void>

export type RunAdapter = {
  handleRun: RunAdapterHandle
  getOpenaiAssistant?: GetOpenaiAssistantFn
}

export type RunAdapterPartobClient = Omit<RunAdapter, 'handleRun'> & {
  handleRun: (
    args: Omit<RunAdapterHandleArgs, 'client'>,
  ) => ReturnType<RunAdapterHandle>
}

export type RunAdapterWithAssistant = RunAdapterPartobClient & {
  getOpenaiAssistant: GetOpenaiAssistantFn
}

export type StorageAdapterArgs = {
  client: OpenAI
  runAdapter: RunAdapterPartobClient
  originalClientAdapter?: any
}

export type RequestHandler = (
  url: string,
  init: RequestInit & { body?: string },
) => Promise<Response>
