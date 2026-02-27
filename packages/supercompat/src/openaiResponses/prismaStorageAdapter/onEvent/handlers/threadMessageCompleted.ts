import type OpenAI from 'openai'
import type { PrismaClient } from '@prisma/client'
import { serializeOutputItem } from '../../../serializers/serializeOutputItem'

export const threadMessageCompleted = async ({
  prisma,
  event,
  controller,
  outputItemId,
}: {
  prisma: PrismaClient
  event: OpenAI.Beta.AssistantStreamEvent.ThreadMessageCompleted
  controller: ReadableStreamDefaultController
  outputItemId: string
}) => {
  const textContent = event.data.content?.[0]
  const text = textContent?.type === 'text' ? textContent.text.value : ''

  const outputItem = await prisma.responseOutputItem.update({
    where: { id: outputItemId },
    data: {
      status: 'COMPLETED',
      content: [{ type: 'output_text', text, annotations: [] }],
    },
  })

  const serialized = serializeOutputItem({ outputItem })

  controller.enqueue({
    type: 'response.output_text.done',
    item_id: outputItemId,
    output_index: 0,
    content_index: 0,
    text,
  })

  controller.enqueue({
    type: 'response.output_item.done',
    output_index: 0,
    item: serialized,
  })

  // Return an object compatible with completionsRunAdapter expectations
  // It accesses .toolCalls to determine if there are pending function calls
  const toolCalls = (event.data as any)?.tool_calls
  return {
    ...outputItem,
    toolCalls: toolCalls ?? null,
  }
}
