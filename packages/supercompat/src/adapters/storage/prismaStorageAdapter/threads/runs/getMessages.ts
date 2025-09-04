import type { PrismaClient } from '@prisma/client'
import { serializeMessage } from '../messages/serializeMessage'
import { serializeRunStep } from './steps/serializeRunStep'
import { serializeRun } from './serializeRun'
import type { RunStep } from '@/types/prisma'

const getTake = ({ run }: { run: { truncationStrategy: any } }) => {
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

export const getMessages = ({ prisma, run }: { prisma: PrismaClient; run: { threadId: string; truncationStrategy: any } }) => async () => {
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

  return (messages as any[]).map((message: any) => ({
    ...serializeMessage({ message }),
    run: message.run
      ? ({
          ...serializeRun({ run: message.run }),
          runSteps: (message.run.runSteps as any[]).map((runStep: any) => serializeRunStep({ runStep })),
        })
      : null,
  }))
}
