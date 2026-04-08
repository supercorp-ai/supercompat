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
import { MemoryStore } from './store'
import { assistants, assistant } from './handlers/assistants'
import { threads, thread } from './handlers/threads'
import { messages, message } from './handlers/messages'
import { runs, run, cancelRun, createAndRun, submitToolOutputs } from './handlers/runs'
import { steps, step } from './handlers/steps'
import { responsesHandlers } from './handlers/responses'

type MethodHandlers = { get?: RequestHandler; post?: RequestHandler; delete?: RequestHandler }

export const memoryStorageAdapter = (): ((args: StorageAdapterArgs) => { requestHandlers: Record<string, MethodHandlers> }) => {
  const store = new MemoryStore()

  return ({ runAdapter }: StorageAdapterArgs) => ({
    requestHandlers: {
      // Assistants
      [assistantRegexp]: assistant({ store }),
      '^/(?:v1/|openai/)?assistants$': assistants({ store }),
      // Threads
      '^/(?:v1|/?openai)/threads$': threads({ store }),
      [createThreadAndRunRegexp]: createAndRun({ store, runAdapter }),
      [threadRegexp]: thread({ store }),
      // Messages
      [messageRegexp]: message({ store }),
      [messagesRegexp]: messages({ store }),
      // Runs
      [cancelRunRegexp]: cancelRun({ store }),
      [submitToolOutputsRegexp]: submitToolOutputs({ store, runAdapter }),
      [runRegexp]: run({ store, runAdapter }),
      [runsRegexp]: runs({ store, runAdapter }),
      // Steps
      [stepRegexp]: step({ store }),
      [stepsRegexp]: steps({ store }),
      // Responses API
      ...responsesHandlers({ store, runAdapter }),
    },
  })
}
