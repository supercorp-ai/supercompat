import type OpenAI from 'openai'
import type { PrismaClient } from '@prisma/client'
import { serializeResponse } from '../../../serializers/serializeResponse'

export const threadRunCompleted = async ({
  prisma,
  event,
  controller,
  responseId,
}: {
  prisma: PrismaClient
  event: OpenAI.Beta.AssistantStreamEvent.ThreadRunCompleted
  controller: ReadableStreamDefaultController
  responseId: string
}) => {
  const response = await prisma.response.update({
    where: { id: responseId },
    data: {
      status: 'COMPLETED',
      usage: event.data.usage ?? undefined,
    },
    include: { outputItems: true, tools: { include: { functionTool: true, fileSearchTool: true, webSearchTool: true, codeInterpreterTool: true, computerUseTool: true } } },
  })

  const serialized = serializeResponse({ response })

  controller.enqueue({
    type: 'response.completed',
    response: serialized,
  })
}
