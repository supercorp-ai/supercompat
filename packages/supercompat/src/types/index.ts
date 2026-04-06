import type OpenAI from 'openai'

export type MessageWithRun = OpenAI.Beta.Threads.Message & {
  run: (OpenAI.Beta.Threads.Run & {
    runSteps: OpenAI.Beta.Threads.Runs.RunStep[]
  }) | null
}

interface GetOpenaiAssistantFn {
  (args: { select: { id: true } }):
    | Pick<OpenAI.Beta.Assistants.Assistant, 'id'>
    | Promise<Pick<OpenAI.Beta.Assistants.Assistant, 'id'>>
  (args?: { select?: { id?: false } }):
    | OpenAI.Beta.Assistants.Assistant
    | Promise<OpenAI.Beta.Assistants.Assistant>
}

type RunAdapterHandleArgsThreadRun = {
  client: OpenAI
  run: OpenAI.Beta.Threads.Run
  onEvent: (event: OpenAI.Beta.AssistantStreamEvent) => Promise<any>
  getMessages: () => Promise<MessageWithRun[]>
  threadId?: never
  response?: never
}

type RunAdapterHandleArgsResponse = {
  client: OpenAI
  threadId: string
  response: unknown
  onEvent: (event: OpenAI.Beta.AssistantStreamEvent) => Promise<any>
  run?: never
  getMessages?: never
}

export type RunAdapterHandleArgs =
  | RunAdapterHandleArgsThreadRun
  | RunAdapterHandleArgsResponse

export type RunAdapterHandle = (
  args: RunAdapterHandleArgs,
) => Promise<void>

export type RunAdapter = {
  handleRun: RunAdapterHandle
  getOpenaiAssistant?: GetOpenaiAssistantFn
}

export type RunAdapterPartobClient = Omit<RunAdapter, 'handleRun'> & {
  handleRun: (
    args: Omit<Parameters<RunAdapterHandle>[0], 'client'>,
  ) => ReturnType<RunAdapterHandle>
}

export type RunAdapterWithAssistant = RunAdapterPartobClient & {
  getOpenaiAssistant: GetOpenaiAssistantFn
}

export type StorageAdapterArgs = {
  client: OpenAI
  runAdapter: RunAdapterPartobClient
  originalClient?: any
}

export type RequestHandler = (
  url: string,
  init: RequestInit & { body?: string },
) => Promise<Response>
