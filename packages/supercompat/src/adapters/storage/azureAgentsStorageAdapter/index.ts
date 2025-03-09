import type {
  AIProjectsClient,
} from '@azure/ai-projects'
import type { PrismaClient } from '@prisma/client'
import { StorageAdapterArgs } from '@/types'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'
import { runsRegexp } from '@/lib/runs/runsRegexp'
import { runRegexp } from '@/lib/runs/runRegexp'
import { submitToolOutputsRegexp } from '@/lib/runs/submitToolOutputsRegexp'
import { stepsRegexp } from '@/lib/steps/stepsRegexp'
import { threadsRegexp } from '@/lib/threads/threadsRegexp'
import { threads } from './threads'
import { messages } from './threads/messages'
import { runs } from './threads/runs'
import { run } from './threads/run'
import { steps } from './threads/runs/steps'
import { submitToolOutputs } from './threads/runs/submitToolOutputs'

export const azureAgentsStorageAdapter = ({
  azureAiProjectsClient,
}: {
  azureAiProjectsClient: AIProjectsClient
}) => ({
  runAdapter,
}: StorageAdapterArgs) => ({
  requestHandlers: {
    [threadsRegexp]: threads({ azureAiProjectsClient }),
    [messagesRegexp]: messages({ azureAiProjectsClient }),
    [runsRegexp]: runs({ azureAiProjectsClient, runAdapter }),
    [runRegexp]: run({ azureAiProjectsClient, runAdapter }),
    [stepsRegexp]: steps({ azureAiProjectsClient }),
    [submitToolOutputsRegexp]: submitToolOutputs({ azureAiProjectsClient, runAdapter }),
  },
})
