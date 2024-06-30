import type { PrismaClient } from '@prisma/client'
import { serializeMessage } from '../messages/serializeMessage'
import { serializeRunStep } from './steps/serializeRunStep'
import { serializeRun } from './serializeRun'
import type { Run, MessageWithRun, RunStep } from '@/types/prisma'

const getTake = ({
  run,
}: {
  run: Run
}) => {
  // @ts-ignore-next-line
  if (run.truncationStrategy.type === 'auto') {
    return null
  }

  // @ts-ignore-next-line
  if (run.truncationStrategy.type === 'last_messages') {
    // @ts-ignore-next-line
    if (!run.truncationStrategy.last_messages) {
      throw new Error('Truncation strategy last_messages is required')
    }

    // @ts-ignore-next-line
    return -run.truncationStrategy.last_messages
  }

  // @ts-ignore-next-line
  throw new Error(`Unsupported truncation strategy type: ${run.truncationStrategy.type}`)
}

export const getMessages = ({
  prisma,
  run,
}: {
  prisma: PrismaClient
  run: Run
}) => async () => {
  const take = getTake({
    run,
  })

  const messages = await prisma.message.findMany({
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
  })

  return messages.map((message: MessageWithRun) => ({
    ...serializeMessage({ message }),
    run: message.run ? ({
      ...serializeRun({ run: message.run }),
      runSteps: message.run.runSteps.map((runStep: RunStep) => (
        serializeRunStep({ runStep })
      )),
    }) : null,
  }))
}
