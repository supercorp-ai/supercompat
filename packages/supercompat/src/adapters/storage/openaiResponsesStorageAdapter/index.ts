import OpenAI from 'openai'
import { StorageAdapterArgs } from '@/types'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'
import { runsRegexp } from '@/lib/runs/runsRegexp'
import { runRegexp } from '@/lib/runs/runRegexp'
import { submitToolOutputsRegexp } from '@/lib/runs/submitToolOutputsRegexp'
import { submitToolOutputsWithoutThreadRegexp } from '@/lib/runs/submitToolOutputsWithoutThreadRegexp'
import { stepsRegexp } from '@/lib/steps/stepsRegexp'
import { threads } from './threads'
import { messages } from './threads/messages'
import { runs } from './threads/runs'
import { run } from './threads/run'
import { submitToolOutputs } from './threads/runs/submitToolOutputs'
import { steps } from './threads/runs/steps'

export const openaiResponsesStorageAdapter = ({
  openai,
}: {
  openai: OpenAI
}) => ({ runAdapter }: StorageAdapterArgs) => ({
  requestHandlers: {
    '^/(?:v1|/?openai)/threads$': threads({ openai }),
    [messagesRegexp]: messages({ openai }),
    [runsRegexp]: runs({ openai, runAdapter }),
    [runRegexp]: run({ openai }),
    [submitToolOutputsRegexp]: submitToolOutputs({ openai, runAdapter }),
    [submitToolOutputsWithoutThreadRegexp]: submitToolOutputs({
      openai,
      runAdapter,
    }),
    [stepsRegexp]: steps({ openai }),
  },
})
