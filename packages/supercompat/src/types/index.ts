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

export type RunAdapterPartobClient = (args: Omit<Parameters<RunAdapter>[0], 'client'>) => ReturnType<RunAdapter>

export type StorageAdapterArgs = {
  runAdapter: RunAdapter
}

export type RequestHandler = (
  url: string,
  init: RequestInit & { body?: string },
) => Promise<Response>
