import type { PrismaClient } from '@prisma/client'
import { StorageAdapterArgs } from '@/types'
import type { RequestHandler } from '@/types'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'
import { runsRegexp } from '@/lib/runs/runsRegexp'
import { runRegexp } from '@/lib/runs/runRegexp'
import { submitToolOutputsRegexp } from '@/lib/runs/submitToolOutputsRegexp'
import { stepsRegexp } from '@/lib/steps/stepsRegexp'
import { threads } from './threads'
import { messages } from './threads/messages'
import { runs } from './threads/runs'
import { run } from './threads/run'
import { steps } from './threads/runs/steps'
import { submitToolOutputs } from './threads/runs/submitToolOutputs'
import { assistants } from './assistants'

type MethodHandlers = { get?: RequestHandler; post?: RequestHandler }

export const prismaStorageAdapter = ({
  prisma,
}: {
  prisma: PrismaClient
}): ((args: StorageAdapterArgs) => { requestHandlers: Record<string, MethodHandlers> }) =>
({ runAdapter }: StorageAdapterArgs) => ({
  requestHandlers: {
    '^/(?:v1/|openai/)?assistants$': assistants({ prisma }),
    '^/(?:v1|/?openai)/threads$': threads({ prisma }),
    [messagesRegexp]: messages({ prisma }),
    [runsRegexp]: runs({ prisma, runAdapter }),
    [runRegexp]: run({ prisma }),
    [stepsRegexp]: steps({ prisma }),
    [submitToolOutputsRegexp]: submitToolOutputs({ prisma, runAdapter }),
  },
})
