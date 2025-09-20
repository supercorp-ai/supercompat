import type { OpenAI } from 'openai'
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

export const responsesStorageAdapter = (): ((args: StorageAdapterArgs) => { requestHandlers: Record<string, MethodHandlers> }) => {
  const createResponseItems: OpenAI.Responses.ResponseInputItem[] = []

  return ({ runAdapter, client }: StorageAdapterArgs) => ({
    requestHandlers: {
      '^/(?:v1|/?openai)/assistants$': assistants({ runAdapter }),
      '^/(?:v1|/?openai)/threads$': threads({ client }),
      [messagesRegexp]: messages({ client, runAdapter, createResponseItems }),
      [runsRegexp]: runs({ client, runAdapter, createResponseItems }),
      [runRegexp]: run({ client, runAdapter }),
      [stepsRegexp]: steps({ client, runAdapter }),
      [submitToolOutputsRegexp]: submitToolOutputs({ client, runAdapter }),
    },
  })
}
