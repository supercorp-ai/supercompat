import type { OpenAI } from 'openai'
import { StorageAdapterArgs, RunAdapterWithAssistant } from '@/types'
import type { RequestHandler } from '@/types'
import { messagesRegexp } from '@/openaiAssistants/lib/messages/messagesRegexp'
import { messageRegexp } from '@/openaiAssistants/lib/messages/messageRegexp'
import { runsRegexp } from '@/openaiAssistants/lib/runs/runsRegexp'
import { runRegexp } from '@/openaiAssistants/lib/runs/runRegexp'
import { cancelRunRegexp } from '@/openaiAssistants/lib/runs/cancelRunRegexp'
import { submitToolOutputsRegexp } from '@/openaiAssistants/lib/runs/submitToolOutputsRegexp'
import { stepsRegexp } from '@/openaiAssistants/lib/steps/stepsRegexp'
import { threadRegexp } from '@/openaiAssistants/lib/threads/threadRegexp'
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

export const responsesStorageAdapter = ({
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
