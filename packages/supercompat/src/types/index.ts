import type OpenAI from 'openai'

export type ThreadWithConversationId = OpenAI.Beta.Threads.Thread & {
  openaiConversationId: string | null
}

export type MessageWithRun = Omit<OpenAI.Beta.Threads.Message, 'metadata'> & {
  metadata: (Record<string, unknown> & {
    toolCalls?: OpenAI.Beta.Threads.Runs.Steps.ToolCall[]
  }) | null
  run: (OpenAI.Beta.Threads.Run & {
    runSteps: OpenAI.Beta.Threads.Runs.RunStep[]
  }) | null
}

export type RunAdapter = ({
  client,
  run,
  onEvent,
  getMessages,
  getThread,
}: {
  client: OpenAI
  run: OpenAI.Beta.Threads.Run
  onEvent: (event: OpenAI.Beta.AssistantStreamEvent) => Promise<unknown>
  getMessages: () => Promise<MessageWithRun[]>
  getThread: () => Promise<ThreadWithConversationId | null>
}) => Promise<void>

export type RunAdapterPartobClient = (args: Omit<Parameters<RunAdapter>[0], 'client'>) => ReturnType<RunAdapter>

export type StorageAdapterArgs = {
  runAdapter: RunAdapterPartobClient
}
