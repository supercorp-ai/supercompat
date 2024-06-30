import type OpenAI from 'openai'
import { flat } from 'radash'
import { MessageWithRun } from '@/types'
import { serializeMessage } from './serializeMessage'

export const messages = async ({
  run,
  getMessages,
}: {
  run: OpenAI.Beta.Threads.Run
  getMessages: () => Promise<MessageWithRun[]>
}) => (
  flat((await getMessages()).map((message: MessageWithRun) => serializeMessage({ message })))
)
