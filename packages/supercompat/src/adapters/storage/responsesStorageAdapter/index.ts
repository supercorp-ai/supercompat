import OpenAI from 'openai'
import { StorageAdapterArgs } from '@/types'
import type { RequestHandler } from '@/types'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'
import { runsRegexp } from '@/lib/runs/runsRegexp'
import { runRegexp } from '@/lib/runs/runRegexp'
import { submitToolOutputsRegexp } from '@/lib/runs/submitToolOutputsRegexp'
import { stepsRegexp } from '@/lib/steps/stepsRegexp'
import { createThreadsHandlers } from './routes/threads'
import { createMessagesHandlers } from './routes/messages'
import { createRunsHandlers } from './routes/runs'
import { createRunHandlers } from './routes/run'
import { createStepsHandlers } from './routes/steps'
import { createSubmitToolOutputsHandlers } from './routes/submitToolOutputs'
import { serializeThreadMessage } from './helpers/serializeThreadMessage'
import { onEventBridgeInMemory } from './helpers/onEventBridgeInMemory'

type MethodHandlers = { get?: RequestHandler; post?: RequestHandler }

export const responsesStorageAdapter = ({
  openai,
  getConversationId,
  setConversationId,
}: {
  openai: OpenAI
  getConversationId: (threadId: string) => Promise<string | null>
  setConversationId: (threadId: string, conversationId: string) => Promise<void>
}) =>
  ({ runAdapter }: StorageAdapterArgs) => {
    // Track last user text per thread to seed Responses input without delays
    const threadLastUserText = new Map<string, string>()
    const ensureConversation = async (threadId: string) => {
      let convId = await getConversationId(threadId)
      if (!convId) {
        const conv = await openai.conversations.create({ metadata: { thread_id: threadId } })
        convId = conv.id
        await setConversationId(threadId, convId)
      }
      return convId
    }

    // Assistant loader
    const getAssistant = async (assistantId: string) => {
      const a = await openai.beta.assistants.retrieve(assistantId)
      return { model: a.model, instructions: (a.instructions ?? '') as string }
    }

    // In-memory state for runs and steps
    const runs = new Map<string, OpenAI.Beta.Threads.Run>()
    const runSteps = new Map<string, OpenAI.Beta.Threads.Runs.RunStep[]>()
    const runLastResponseId = new Map<string, string>()
    const runCompletedAfterTool = new Map<string, boolean>()
    const runToolSubmitted = new Map<string, boolean>()

    // Handlers
    const threadsHandler = createThreadsHandlers()
    const messagesHandler = createMessagesHandlers({
      openai,
      ensureConversation,
      getConversationId,
      serializeThreadMessage,
      setLastUserText: (threadId: string, text: string) => {
        if (typeof text === 'string') threadLastUserText.set(threadId, text)
      },
    })
    const runsHandler = createRunsHandlers({
      openai,
      runAdapter,
      getAssistant,
      getConversationId,
      setConversationId,
      ensureConversation,
      onEventBridge: ({ controller }) =>
        onEventBridgeInMemory({ controller, runs, runSteps, runCompletedAfterTool, getConversationId, openai, ensureConversation }),
      runs,
      runSteps,
      runLastResponseId,
      getLastUserText: (threadId: string) => threadLastUserText.get(threadId) ?? '',
    })
    const runHandler = createRunHandlers({ openai, runs, runSteps, getConversationId, runCompletedAfterTool, runToolSubmitted })
    const stepsHandler = createStepsHandlers({ runSteps })
    const submitToolOutputsHandler = createSubmitToolOutputsHandlers({
      openai,
      runAdapter,
      runs,
      onEventBridge: ({ controller }) =>
        onEventBridgeInMemory({ controller, runs, runSteps, runCompletedAfterTool, getConversationId, openai, ensureConversation }),
      getConversationId,
      ensureConversation,
      setConversationId,
      getAssistant,
      runLastResponseId,
      runCompletedAfterTool,
      runToolSubmitted,
    })

    return {
      requestHandlers: {
        '^/(?:v1|/?openai)/threads$': threadsHandler,
        [messagesRegexp]: messagesHandler,
        [runsRegexp]: runsHandler,
        [runRegexp]: runHandler,
        [stepsRegexp]: stepsHandler,
        [submitToolOutputsRegexp]: submitToolOutputsHandler,
      },
    }
  }
