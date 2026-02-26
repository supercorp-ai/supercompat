import type { PrismaClient } from '@prisma/client'
import { StorageAdapterArgs } from '@/types'
import type { RequestHandler } from '@/types'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'
import { messageRegexp } from '@/lib/messages/messageRegexp'
import { runsRegexp } from '@/lib/runs/runsRegexp'
import { runRegexp } from '@/lib/runs/runRegexp'
import { cancelRunRegexp } from '@/lib/runs/cancelRunRegexp'
import { createThreadAndRunRegexp } from '@/lib/runs/createThreadAndRunRegexp'
import { submitToolOutputsRegexp } from '@/lib/runs/submitToolOutputsRegexp'
import { stepsRegexp } from '@/lib/steps/stepsRegexp'
import { stepRegexp } from '@/lib/steps/stepRegexp'
import { threadRegexp } from '@/lib/threads/threadRegexp'
import { assistantRegexp } from '@/lib/assistants/assistantRegexp'
import { threads } from './threads'
import { thread } from './threads/thread'
import { messages } from './threads/messages'
import { message } from './threads/messages/message'
import { runs } from './threads/runs'
import { run } from './threads/run'
import { cancelRun } from './threads/run/cancel'
import { createAndRun } from './threads/createAndRun'
import { steps } from './threads/runs/steps'
import { step } from './threads/runs/steps/step'
import { submitToolOutputs } from './threads/runs/submitToolOutputs'
import { assistants } from './assistants'
import { assistant } from './assistants/assistant'

type MethodHandlers = { get?: RequestHandler; post?: RequestHandler; delete?: RequestHandler }

export const prismaStorageAdapter = ({
  prisma,
}: {
  prisma: PrismaClient
}): ((args: StorageAdapterArgs) => { requestHandlers: Record<string, MethodHandlers> }) =>
({ runAdapter }: StorageAdapterArgs) => ({
  requestHandlers: {
    // Assistants
    [assistantRegexp]: assistant({ prisma }),
    '^/(?:v1/|openai/)?assistants$': assistants({ prisma }),
    // Threads
    '^/(?:v1|/?openai)/threads$': threads({ prisma }),
    [threadRegexp]: thread({ prisma }),
    // Messages
    [messageRegexp]: message({ prisma }),
    [messagesRegexp]: messages({ prisma }),
    // Runs
    [cancelRunRegexp]: cancelRun({ prisma }),
    [submitToolOutputsRegexp]: submitToolOutputs({ prisma, runAdapter }),
    [createThreadAndRunRegexp]: createAndRun({ prisma, runAdapter }),
    [runRegexp]: run({ prisma, runAdapter }),
    [runsRegexp]: runs({ prisma, runAdapter }),
    // Steps
    [stepRegexp]: step({ prisma }),
    [stepsRegexp]: steps({ prisma }),
  },
})
