import type { PrismaClient } from '@prisma/client'
import { serializeMessage, PrismaMessage } from '../messages/serializeMessage'
import { serializeRunStep, PrismaRunStep } from './steps/serializeRunStep'
import { serializeRun, PrismaRun } from './serializeRun'
import type { MessageWithRun as OpenAIMessageWithRun } from '@/types'

export interface RunForMessages {
  threadId: string
  truncationStrategy: {
    type: string
    last_messages?: number
  }
}

const getTake = ({ run }: { run: RunForMessages }) => {
  if (run.truncationStrategy.type === 'auto') {
    return null
  }

  if (run.truncationStrategy.type === 'last_messages') {
    if (!run.truncationStrategy.last_messages) {
      throw new Error('Truncation strategy last_messages is required')
    }

    return -run.truncationStrategy.last_messages
  }

  throw new Error(
    `Unsupported truncation strategy type: ${run.truncationStrategy.type}`,
  )
}

export const getMessages = ({
  prisma,
  run,
}: {
  prisma: PrismaClient
  run: RunForMessages
}) => async () => {
  const take = getTake({
    run,
  })

  const messages = (await prisma.message.findMany({
    where: {
      threadId: run.threadId,
    },
    include: {
      run: {
        include: {
          runSteps: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
    ...(take ? { take } : {}),
  })) as Array<
    PrismaMessage & { run: (PrismaRun & { runSteps: PrismaRunStep[] }) | null }
  >

  return messages.map((message) => ({
    ...serializeMessage({ message }),
    run: message.run
      ? {
          ...serializeRun({ run: message.run }),
          runSteps: message.run.runSteps.map((runStep: PrismaRunStep) =>
            serializeRunStep({ runStep }),
          ),
        }
      : null,
  })) as OpenAIMessageWithRun[]
}
