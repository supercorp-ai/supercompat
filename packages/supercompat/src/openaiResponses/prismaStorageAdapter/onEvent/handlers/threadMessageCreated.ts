import type OpenAI from 'openai'
import type { PrismaClient } from '@prisma/client'
import { serializeOutputItem } from '../../../serializers/serializeOutputItem'

export const threadMessageCreated = async ({
  prisma,
  event,
  controller,
  responseId,
}: {
  prisma: PrismaClient
  event: OpenAI.Beta.AssistantStreamEvent.ThreadMessageCreated
  controller: ReadableStreamDefaultController
  responseId: string
}) => {
  const outputItem = await prisma.responseOutputItem.create({
    data: {
      responseId,
      type: 'MESSAGE',
      status: 'IN_PROGRESS',
      role: 'assistant',
      content: [{ type: 'output_text', text: '', annotations: [] }],
    },
  })

  const serialized = serializeOutputItem({ outputItem })

  controller.enqueue({
    type: 'response.output_item.added',
    output_index: 0,
    item: serialized,
  })

  return outputItem
}
