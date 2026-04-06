import type OpenAI from 'openai'
import type { PrismaClient } from '@prisma/client'
import { serializeResponse } from '../../../serializers/serializeResponse'
import { serializeOutputItem } from '../../../serializers/serializeOutputItem'

type ToolCallInfo = {
  callId: string
  name: string
  argumentChunks: string[]
}

export const threadRunRequiresAction = async ({
  prisma,
  event,
  controller,
  responseId,
  functionCallItems,
  toolCallInfos,
}: {
  prisma: PrismaClient
  event: OpenAI.Beta.AssistantStreamEvent.ThreadRunRequiresAction
  controller: ReadableStreamDefaultController
  responseId: string
  functionCallItems: Map<number, string>
  toolCallInfos: Map<number, ToolCallInfo>
}) => {
  const toolCalls = event.data.required_action?.submit_tool_outputs?.tool_calls ?? []

  for (let i = 0; i < toolCalls.length; i++) {
    const tc = toolCalls[i]
    const info = toolCallInfos.get(i)

    // Create function_call output item in DB
    const item = await prisma.responseOutputItem.create({
      data: {
        responseId,
        type: 'FUNCTION_CALL',
        status: 'COMPLETED',
        callId: tc.id ?? info?.callId ?? '',
        name: tc.function?.name ?? info?.name ?? '',
        arguments: tc.function?.arguments ?? info?.argumentChunks?.join('') ?? '',
      },
    })

    functionCallItems.set(i, item.id)

    const serialized = serializeOutputItem({ outputItem: item })

    controller.enqueue({
      type: 'response.output_item.added',
      output_index: i,
      item: serialized,
    })

    controller.enqueue({
      type: 'response.function_call_arguments.done',
      item_id: item.id,
      output_index: i,
      arguments: tc.function?.arguments ?? info?.argumentChunks?.join('') ?? '',
    })

    controller.enqueue({
      type: 'response.output_item.done',
      output_index: i,
      item: serialized,
    })
  }

  // Mark response as completed
  const response = await prisma.response.update({
    where: { id: responseId },
    data: { status: 'COMPLETED' },
    include: { outputItems: { orderBy: { createdAt: 'asc' } }, tools: { include: { functionTool: true, fileSearchTool: true, webSearchTool: true, codeInterpreterTool: true, computerUseTool: true } } },
  })

  const serialized = serializeResponse({ response })

  controller.enqueue({
    type: 'response.completed',
    response: serialized,
  })
}
