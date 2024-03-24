import type { PrismaClient } from '@prisma/client'
import { serializeMessage } from '../messages/serializeMessage'
import { serializeRunStep } from './steps/serializeRunStep'
import { serializeRun } from './serializeRun'
import type { Run, MessageWithRun, RunStep } from '@/types/prisma'

export const getMessages = ({
  prisma,
  run,
}: {
  prisma: PrismaClient
  run: Run
}) => async ({
  messagesHistoryLength,
}: {
  messagesHistoryLength: number
}) => {
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
    take: -messagesHistoryLength,
    orderBy: {
      createdAt: 'asc',
    },
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
