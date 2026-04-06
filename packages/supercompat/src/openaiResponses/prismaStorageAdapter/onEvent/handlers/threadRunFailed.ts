import type OpenAI from 'openai'
import type { PrismaClient, Prisma } from '@prisma/client'
import { serializeResponse } from '../../../serializers/serializeResponse'

export const threadRunFailed = async ({
  prisma,
  event,
  controller,
  responseId,
}: {
  prisma: PrismaClient
  event: OpenAI.Beta.AssistantStreamEvent.ThreadRunFailed
  controller: ReadableStreamDefaultController
  responseId: string
}) => {
  const response = await prisma.response.update({
    where: { id: responseId },
    data: {
      status: 'FAILED',
      ...(event.data.last_error != null
        ? { error: event.data.last_error as unknown as Prisma.InputJsonValue }
        : {}),
    },
    include: { outputItems: true, tools: { include: { functionTool: true, fileSearchTool: true, webSearchTool: true, codeInterpreterTool: true, computerUseTool: true } } },
  })

  const serialized = serializeResponse({ response })

  controller.enqueue({
    type: 'response.failed',
    response: serialized,
  })
}
