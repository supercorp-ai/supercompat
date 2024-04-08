import type OpenAI from 'openai'
import { flat } from 'radash'
import { MessageWithRun } from '@/types'
import { serializeMessage } from './serializeMessage'

export const messages = async ({
  run,
  getMessages,
  messagesHistoryLength,
}: {
  run: OpenAI.Beta.Threads.Run
  getMessages: ({
    messagesHistoryLength,
  }: {
    messagesHistoryLength: number
  }) => Promise<MessageWithRun[]>
  messagesHistoryLength: number
}) => (
  [
    ...(run.instructions ? [{
      role: 'system',
      content: run.instructions,
    }] : []),
    ...flat((await getMessages({
      messagesHistoryLength,
    })).map((message: MessageWithRun) => serializeMessage({ message }))),
  ]
)
