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
  getMessages,
}: {
  client: OpenAI
  run: OpenAI.Beta.Threads.Run
  onEvent: (event: OpenAI.Beta.AssistantStreamEvent) => Promise<any>
  getMessages: () => Promise<MessageWithRun[]>
}) => Promise<void>

export type StorageAdapterArgs = {
  runAdapter: RunAdapter
}
