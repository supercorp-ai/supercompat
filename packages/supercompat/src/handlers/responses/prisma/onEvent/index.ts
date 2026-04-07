import type OpenAI from 'openai'
import type { PrismaClient } from '@prisma/client'
import {
  threadRunInProgress,
  threadRunFailed,
  threadRunCompleted,
  threadRunRequiresAction,
  threadRunStepCreated,
  threadRunStepCompleted,
  threadMessageCreated,
  threadMessageDelta,
  threadMessageCompleted,
} from './handlers'
import { serializeOutputItem } from '../../serializers/serializeOutputItem'

type ToolCallInfo = {
  callId: string
  name: string
  argumentChunks: string[]
}

export const onEvent = ({
  prisma,
  controller,
  responseId,
}: {
  prisma: PrismaClient
  controller: ReadableStreamDefaultController
  responseId: string
}) => {
  let currentOutputItemId: string | null = null
  let outputIndex = 0
  // Track tool call info in memory (NOT in DB) during streaming
  const toolCallInfos = new Map<number, ToolCallInfo>()
  // After DB items are created, maps tool call index to ResponseOutputItem id
  const functionCallItems = new Map<number, string>()

  return async (event: OpenAI.Beta.AssistantStreamEvent) => {
    switch (event.event) {
      case 'thread.run.in_progress':
        return threadRunInProgress({
          prisma,
          event: event as OpenAI.Beta.AssistantStreamEvent.ThreadRunInProgress,
          controller,
          responseId,
        })

      case 'thread.message.created': {
        const outputItem = await threadMessageCreated({
          prisma,
          event: event as OpenAI.Beta.AssistantStreamEvent.ThreadMessageCreated,
          controller,
          responseId,
        })
        if (outputItem) {
          currentOutputItemId = outputItem.id
        }
        return outputItem
      }

      case 'thread.message.delta':
        if (!currentOutputItemId) return
        return threadMessageDelta({
          event: event as OpenAI.Beta.AssistantStreamEvent.ThreadMessageDelta,
          controller,
          outputItemId: currentOutputItemId,
        })

      case 'thread.message.completed': {
        if (!currentOutputItemId) return
        const result = await threadMessageCompleted({
          prisma,
          event: event as OpenAI.Beta.AssistantStreamEvent.ThreadMessageCompleted,
          controller,
          outputItemId: currentOutputItemId,
        })
        outputIndex++
        return result
      }

      case 'thread.run.step.created':
        return threadRunStepCreated({
          prisma,
          event: event as OpenAI.Beta.AssistantStreamEvent.ThreadRunStepCreated,
          controller,
          responseId,
          outputIndex,
        })

      case 'thread.run.step.delta': {
        // Track tool call deltas in memory — NO async DB writes here
        // because completionsRunAdapter doesn't await this event
        const toolCalls = ((event as any).data.delta as any)?.step_details?.tool_calls
        if (!toolCalls) return

        for (const tc of toolCalls) {
          const index = tc.index ?? 0

          if (!toolCallInfos.has(index)) {
            toolCallInfos.set(index, {
              callId: tc.id ?? '',
              name: tc.function?.name ?? '',
              argumentChunks: [],
            })
          }

          const info = toolCallInfos.get(index)!

          // Update callId and name if provided (typically on first delta)
          if (tc.id) info.callId = tc.id
          if (tc.function?.name) info.name = tc.function.name

          const argsDelta = tc.function?.arguments ?? ''
          if (argsDelta) {
            info.argumentChunks.push(argsDelta)

            // Emit delta event with a placeholder item_id (will be real after DB create)
            controller.enqueue({
              type: 'response.function_call_arguments.delta',
              item_id: `pending_${index}`,
              output_index: outputIndex + index,
              delta: argsDelta,
            })
          }
        }
        return
      }

      case 'thread.run.step.completed':
        return threadRunStepCompleted({
          prisma,
          event: event as OpenAI.Beta.AssistantStreamEvent.ThreadRunStepCompleted,
          controller,
        })

      case 'thread.run.completed':
        return threadRunCompleted({
          prisma,
          event: event as OpenAI.Beta.AssistantStreamEvent.ThreadRunCompleted,
          controller,
          responseId,
        })

      case 'thread.run.requires_action':
        return threadRunRequiresAction({
          prisma,
          event: event as OpenAI.Beta.AssistantStreamEvent.ThreadRunRequiresAction,
          controller,
          responseId,
          functionCallItems,
          toolCallInfos,
        })

      case 'thread.run.failed':
        return threadRunFailed({
          prisma,
          event: event as OpenAI.Beta.AssistantStreamEvent.ThreadRunFailed,
          controller,
          responseId,
        })

      default:
        console.log('No Responses API handler for event', event.event)
    }
  }
}
