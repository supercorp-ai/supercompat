import type OpenAI from 'openai'
import type { ChatCompletionMessageToolCall } from 'openai/resources/chat/completions'
import { MessageStatus, RunStepType } from '@/types/prisma'
import type { PrismaClient } from '@prisma/client'

type MessageWithToolCalls = OpenAI.Beta.Threads.Messages.Message & {
  tool_calls?: ChatCompletionMessageToolCall[]
}

export const threadMessageCompleted = async ({
  prisma,
  event,
  controller,
}: {
  prisma: PrismaClient
  event: OpenAI.Beta.AssistantStreamEvent.ThreadMessageCompleted
  controller: ReadableStreamDefaultController<OpenAI.Beta.AssistantStreamEvent.ThreadMessageCompleted>
}) => {
  controller.enqueue(event)

  const data = event.data as MessageWithToolCalls

  if (data.tool_calls) {
    const latestRunStep = await prisma.runStep.findFirst({
      where: {
        threadId: event.data.thread_id,
        type: RunStepType.TOOL_CALLS,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    if (!latestRunStep) {
      throw new Error('No run step found')
    }

      await prisma.runStep.update({
        where: {
          id: latestRunStep.id,
        },
        data: {
          stepDetails: {
            type: 'tool_calls',
            tool_calls: data.tool_calls,
          } as any,
        },
      })
    }

    return prisma.message.update({
      where: {
        id: event.data.id,
      },
      data: {
        status: MessageStatus.COMPLETED,
        ...(data.content ? { content: data.content as any } : {}),
        ...(data.tool_calls ? { toolCalls: data.tool_calls as any } : {}),
      },
    })
  }
