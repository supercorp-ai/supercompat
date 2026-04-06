import type OpenAI from 'openai'
import type { PrismaClient } from '@prisma/client'
import { serializeResponse } from '../../../serializers/serializeResponse'

export const threadRunInProgress = async ({
  prisma,
  event,
  controller,
  responseId,
}: {
  prisma: PrismaClient
  event: OpenAI.Beta.AssistantStreamEvent.ThreadRunInProgress
  controller: ReadableStreamDefaultController
  responseId: string
}) => {
  const response = await prisma.response.update({
    where: { id: responseId },
    data: { status: 'IN_PROGRESS' },
    include: { outputItems: true, tools: { include: { functionTool: true, fileSearchTool: true, webSearchTool: true, codeInterpreterTool: true, computerUseTool: true } } },
  })

  const serialized = serializeResponse({ response })

  controller.enqueue({
    type: 'response.created',
    response: serialized,
  })

  controller.enqueue({
    type: 'response.in_progress',
    response: serialized,
  })
}
