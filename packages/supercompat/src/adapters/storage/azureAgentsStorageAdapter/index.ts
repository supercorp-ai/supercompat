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
import { fileRegexp } from '@/lib/files/fileRegexp'
import { fileContentRegexp } from '@/lib/files/fileContentRegexp'
import { file } from './files/get'
import { fileContent } from './files/content'

type MethodHandlers = { get?: RequestHandler; post?: RequestHandler }

type AzureAgentsStorageAdapterArgs = StorageAdapterArgs & {
  runAdapter: RunAdapterWithAssistant
}

export const azureAgentsStorageAdapter = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}) => {
  return ({ runAdapter }: AzureAgentsStorageAdapterArgs) => ({
    requestHandlers: {
      '^/(?:v1|/?openai)/assistants$': assistants({ runAdapter }),
      '^/(?:v1|/?openai)/threads$': threads({ azureAiProject }),
      [messagesRegexp]: messages({ azureAiProject, runAdapter }),
      [runsRegexp]: runs({ azureAiProject, runAdapter }),
      [runRegexp]: run({ azureAiProject, runAdapter }),
      [stepsRegexp]: steps({ azureAiProject, runAdapter }),
      [submitToolOutputsRegexp]: submitToolOutputs({ azureAiProject, runAdapter }),
      [fileRegexp]: file({ azureAiProject }),
      [fileContentRegexp]: fileContent({ azureAiProject }),
    },
  })
}
