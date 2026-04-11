import type { OpenAI } from 'openai'
import { StorageAdapterArgs, RunAdapterWithAssistant } from '@/types'
import type { RequestHandler } from '@/types'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'
import { messageRegexp } from '@/lib/messages/messageRegexp'
import { runsRegexp } from '@/lib/runs/runsRegexp'
import { runRegexp } from '@/lib/runs/runRegexp'
import { cancelRunRegexp } from '@/lib/runs/cancelRunRegexp'
import { submitToolOutputsRegexp } from '@/lib/runs/submitToolOutputsRegexp'
import { stepsRegexp } from '@/lib/steps/stepsRegexp'
import { threadRegexp } from '@/lib/threads/threadRegexp'
import { threads } from './threads'
import { thread } from './threads/thread'
import { messages } from './threads/messages'
import { message } from './threads/messages/message'
import { runs } from './threads/runs'
import { run } from './threads/run'
import { cancelRun } from './threads/run/cancel'
import { steps } from './threads/runs/steps'
import { submitToolOutputs } from './threads/runs/submitToolOutputs'
import { assistants } from './assistants'

type MethodHandlers = { get?: RequestHandler; post?: RequestHandler; delete?: RequestHandler }

type ResponsesStorageAdapterArgs = StorageAdapterArgs & {
  runAdapter: RunAdapterWithAssistant
}

export const openaiResponsesStorageAdapter = ({
  deferItemCreationUntilRun = false,
}: {
  deferItemCreationUntilRun?: boolean
} = {}): ((args: ResponsesStorageAdapterArgs) => { requestHandlers: Record<string, MethodHandlers> }) => {
  const createResponseItems: OpenAI.Responses.ResponseInputItem[] = []

  return ({ runAdapter, client }: ResponsesStorageAdapterArgs) => ({
    requestHandlers: {
      '^/(?:v1|/?openai)/assistants$': assistants({ runAdapter }),
      '^/(?:v1|/?openai)/threads$': threads({ client }),
      [threadRegexp]: thread({ client }),
      [messageRegexp]: message({ client, runAdapter }),
      [messagesRegexp]: messages({ client, runAdapter, createResponseItems, deferItemCreationUntilRun }),
      [runsRegexp]: runs({ client, runAdapter, createResponseItems }),
      [runRegexp]: run({ client, runAdapter }),
      [cancelRunRegexp]: cancelRun({ client, runAdapter }),
      [stepsRegexp]: steps({ client, runAdapter }),
      [submitToolOutputsRegexp]: submitToolOutputs({ client, runAdapter }),
    },
  })
}
