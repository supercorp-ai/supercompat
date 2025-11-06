import type { AIProjectClient } from '@azure/ai-projects'
import { StorageAdapterArgs, RunAdapterWithAssistant } from '@/types'
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

type AzureAgentsStorageAdapterArgs = StorageAdapterArgs & {
  runAdapter: RunAdapterWithAssistant
}

export const azureAgentsStorageAdapter = ({
  azureAiProject,
  azureAgentId,
}: {
  azureAiProject: AIProjectClient
  azureAgentId: string
}) => {
  return ({ runAdapter }: AzureAgentsStorageAdapterArgs) => ({
    requestHandlers: {
      '^/(?:v1|/?openai)/assistants$': assistants({ runAdapter }),
      '^/(?:v1|/?openai)/threads$': threads({ azureAiProject }),
      [messagesRegexp]: messages({ azureAiProject, runAdapter }),
      [runsRegexp]: runs({ azureAiProject, runAdapter, azureAgentId }),
      [runRegexp]: run({ azureAiProject, runAdapter }),
      [stepsRegexp]: steps({ azureAiProject, runAdapter }),
      [submitToolOutputsRegexp]: submitToolOutputs({ azureAiProject, runAdapter }),
    },
  })
}
