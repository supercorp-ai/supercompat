import type OpenAI from 'openai'

export type MessageWithRun = OpenAI.Beta.Threads.Message & {
  run: (OpenAI.Beta.Threads.Run & {
    runSteps: OpenAI.Beta.Threads.Runs.RunStep[]
  }) | null
}

export type RunAdapter = ({
  client,
  run,
  onEvent,
  getAssistant,
  getConversationId,
  setConversationId,
  inputItems,
  previousResponseId,
  setLastResponseId,
}: {
  client: OpenAI
  run: OpenAI.Beta.Threads.Run
  onEvent: (event: OpenAI.Beta.AssistantStreamEvent) => Promise<any>
  getAssistant: (assistantId: string) => Promise<{ model: string; instructions?: string | null }>
  getConversationId: () => Promise<string | null>
  setConversationId: (conversationId: string) => Promise<void>
  inputItems?: OpenAI.Responses.ResponseInput
  previousResponseId?: string | null
  setLastResponseId?: (responseId: string) => Promise<void> | void
}) => Promise<void>

export type RunAdapterPartobClient = (args: Omit<Parameters<RunAdapter>[0], 'client'>) => ReturnType<RunAdapter>

export type StorageAdapterArgs = {
  runAdapter: RunAdapter
}

export type RequestHandler = (
  url: string,
  init: RequestInit & { body?: string },
) => Promise<Response>

export type ThreadWithConversationId = OpenAI.Beta.Threads.Thread & {
  openaiConversationId: string | null
}
