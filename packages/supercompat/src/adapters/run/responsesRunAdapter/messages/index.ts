import type OpenAI from 'openai'
import { flat } from 'radash'
import type {
  ResponseInput,
  ResponseInputItem,
} from 'openai/resources/responses/responses'
import { MessageWithRun } from '@/types'
import { serializeMessage } from './serializeMessage'

export const messages = async ({
  run,
  getMessages,
}: {
  run: OpenAI.Beta.Threads.Run
  getMessages: () => Promise<MessageWithRun[]>
}): Promise<ResponseInput> =>
  flat(
    (await getMessages()).map((message: MessageWithRun) =>
      serializeMessage({ message }) as ResponseInputItem[],
    ) as ResponseInputItem[][],
  )
