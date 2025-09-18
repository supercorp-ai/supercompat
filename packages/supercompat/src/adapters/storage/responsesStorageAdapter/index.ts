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

export const responsesStorageAdapter = ({
  openai,
  openaiAssistant,
}: {
  openai: OpenAI
  openaiAssistant: OpenAI.Beta.Assistants.Assistant
}): ((args: StorageAdapterArgs) => { requestHandlers: Record<string, MethodHandlers> }) => {
  const createResponseItems: OpenAI.Responses.ResponseItem[] = []

  return ({ runAdapter }: StorageAdapterArgs) => ({
    requestHandlers: {
      '^/(?:v1|/?openai)/assistants$': assistants({ openai, openaiAssistant }),
      '^/(?:v1|/?openai)/threads$': threads({ openai }),
      [messagesRegexp]: messages({ openai, openaiAssistant, createResponseItems }),
      [runsRegexp]: runs({ openai, openaiAssistant, runAdapter, createResponseItems }),
      [runRegexp]: run({ openai, openaiAssistant, runAdapter }),
      [stepsRegexp]: steps({ openai, openaiAssistant }),
      [submitToolOutputsRegexp]: submitToolOutputs({ openai, openaiAssistant, runAdapter }),
    },
  })
}
